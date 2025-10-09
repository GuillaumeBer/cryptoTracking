import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder, BN, type Idl } from '@coral-xyz/anchor';
import fetch, { type RequestInfo, type RequestInit, type Response } from 'node-fetch';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { URL } from 'url';
import {
  PerpConnector,
  PerpConnectorContext,
  PerpConnectorResult,
  PerpMarketData,
  PerpDepthLevel,
} from '../../types/perp';
import { getMockMarkets } from './mock-loader';
import { convertIdlToCamelCase } from '@coral-xyz/anchor/dist/cjs/idl.js';
import { IDL as JupiterPerpsIdl } from './jupiter/full-idl';
import { parsePythPriceData, PriceStatus } from './jupiter/pyth';

class JupiterHttpsProxyAgent extends https.Agent {
  private readonly proxyUrl: URL;

  constructor(proxy: string) {
    super({ keepAlive: true });
    this.proxyUrl = new URL(proxy);
  }

  override createConnection(options: any, callback: any): any {
    const connectOptions = { ...(options ?? {}) } as https.AgentOptions & { hostname?: string };
    const onConnect = typeof callback === 'function' ? callback : () => {};

    const proxyPort = Number(this.proxyUrl.port || '80');
    const proxyHost = this.proxyUrl.hostname;
    const targetHost = String(connectOptions.host ?? connectOptions.hostname ?? '');
    const targetPort = Number(connectOptions.port ?? 443);
    const authHeader = this.getAuthorizationHeader();

    const proxySocket = net.connect({ host: proxyHost, port: proxyPort });

    let settled = false;
    const finish = (err: Error | null, socket?: net.Socket) => {
      if (settled) {
        return;
      }
      settled = true;
      onConnect(err, socket);
    };

    proxySocket.once('error', error => {
      proxySocket.destroy();
      finish(error as Error);
    });

    let responseBuffer = '';
    proxySocket.on('data', chunk => {
      responseBuffer += chunk.toString('utf8');
      if (!responseBuffer.includes('\r\n\r\n')) {
        return;
      }

      proxySocket.removeAllListeners('data');
      const [headerPart, rest] = responseBuffer.split('\r\n\r\n');
      const statusLine = headerPart.split('\r\n')[0] ?? '';
      const statusCode = Number(statusLine.split(' ')[1] ?? 0);

      if (statusCode !== 200) {
        proxySocket.destroy();
        finish(new Error(`Proxy CONNECT response ${statusCode}`));
        return;
      }

      const tlsSocket = tls.connect({
        socket: proxySocket,
        servername: typeof connectOptions.servername === 'string' ? connectOptions.servername : targetHost,
      });

      tlsSocket.once('error', error => {
        finish(error as Error);
      });

      if (rest) {
        tlsSocket.unshift(Buffer.from(rest, 'utf8'));
      }

      tlsSocket.once('secureConnect', () => {
        finish(null, tlsSocket);
      });
    });

    proxySocket.once('connect', () => {
      let connectPayload = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
      if (authHeader) {
        connectPayload += `Proxy-Authorization: ${authHeader}\r\n`;
      }
      connectPayload += '\r\n';
      proxySocket.write(connectPayload);
    });

    return undefined;
  }

  private getAuthorizationHeader(): string | undefined {
    if (!this.proxyUrl.username && !this.proxyUrl.password) {
      return undefined;
    }

    const user = decodeURIComponent(this.proxyUrl.username ?? '');
    const pass = decodeURIComponent(this.proxyUrl.password ?? '');
    const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

type RpcFetch = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

type RequestInitWithAgent = RequestInit & { agent?: any };

let cachedProxyFetch: RpcFetch | null = null;
let cachedProxyUrl: string | null = null;

function getProxyUrl(): string | undefined {
  const keys = [
    'JUPITER_SOLANA_RPC_PROXY',
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
  ];

  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function createRpcFetch(): RpcFetch {
  const proxyUrl = getProxyUrl();

  if (!proxyUrl) {
    cachedProxyFetch = null;
    cachedProxyUrl = null;
    return (input, init) => fetch(input, init);
  }

  if (cachedProxyFetch && cachedProxyUrl === proxyUrl) {
    return cachedProxyFetch;
  }

  const agent = new JupiterHttpsProxyAgent(proxyUrl);
  const fetchWithProxy: RpcFetch = (input, init) => {
    const nextInit: RequestInitWithAgent = { ...(init ?? {}) } as RequestInitWithAgent;
    nextInit.agent = nextInit.agent ?? agent;
    return fetch(input, nextInit);
  };

  cachedProxyFetch = fetchWithProxy;
  cachedProxyUrl = proxyUrl;
  return fetchWithProxy;
}

type JupiterPoolAccount = {
  custodies: PublicKey[];
  name: string;
};

type JupiterFundingRateState = {
  cumulativeInterestRate: BN;
  lastUpdate: BN;
  hourlyFundingDbps: BN;
};

type JupiterJumpRateState = {
  minRateBps: BN;
  maxRateBps: BN;
  targetRateBps: BN;
  targetUtilizationRate: BN;
};

type JupiterPricingParams = {
  maxLeverage: BN;
  maxGlobalLongSizes: BN;
  maxGlobalShortSizes: BN;
  onePercentDepthAbove: BN;
  onePercentDepthBelow: BN;
};

type JupiterAssets = {
  guaranteedUsd: BN;
  globalShortSizes: BN;
  owned: BN;
  locked: BN;
};

type JupiterOracleParams = {
  oracleAccount: PublicKey;
  oracleType: { Pyth?: Record<string, never> };
  maxPriceAgeSec: number;
};

type JupiterBorrowLendParams = {
  borrowsLimitInBps: BN;
  maintainanceMarginBps: BN;
  protocolFeeBps: BN;
  liquidationMargin: BN;
  liquidationFeeBps: BN;
};

type JupiterCustodyAccount = {
  mint: PublicKey;
  decimals: number;
  isStable: boolean;
  oracle: JupiterOracleParams;
  pricing: JupiterPricingParams;
  permissions: {
    allowSwap: boolean;
    allowIncreasePosition: boolean;
    allowDecreasePosition: boolean;
  };
  assets: JupiterAssets;
  fundingRateState: JupiterFundingRateState;
  borrowsFundingRateState: JupiterFundingRateState;
  jumpRateState: JupiterJumpRateState;
  increasePositionBps: BN;
  decreasePositionBps: BN;
  borrowLendParameters: JupiterBorrowLendParams;
  priceImpactBuffer: {
    exponent: number;
  };
  debt: BN;
  borrowLendInterestsAccured: BN;
};

const DEFAULT_RPC_URL =
  process.env.JUPITER_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const DEFAULT_POOL_ADDRESS =
  process.env.JUPITER_PERPS_POOL_ADDRESS ?? '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';

const MINT_TO_SYMBOL: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ETH',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'BTC',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

const USD_DECIMALS = 6;
const MAX_LEVERAGE_SCALE = 100_000;
const HOURS_IN_YEAR = 24 * 365;
const MAX_PYTH_SLOT_DRIFT = 25;

const PROGRAM_ID = new PublicKey('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu');
const BPS_POWER = new BN(10_000);
const DBPS_POWER = new BN(100_000);
const RATE_POWER = new BN(1_000_000_000);
const DEBT_POWER = RATE_POWER;

function camelCaseName(name: string): string {
  if (!name) {
    return name;
  }
  const converted = convertIdlToCamelCase({ name } as unknown as Idl) as { name?: string };
  return converted.name ?? name;
}

function normalizeDefinedType(defined: any): any {
  if (typeof defined === 'string') {
    return { name: camelCaseName(defined) };
  }
  if (defined && typeof defined === 'object') {
    const normalized: Record<string, unknown> = { ...defined };
    if (typeof normalized.name === 'string') {
      normalized.name = camelCaseName(normalized.name);
    }
    if (Array.isArray(normalized.generics)) {
      normalized.generics = normalized.generics.map(normalizeType);
    }
    return normalized;
  }
  return defined;
}

function normalizeType(type: any): any {
  if (!type) {
    return type;
  }
  if (typeof type === 'string') {
    return type === 'publicKey' ? 'pubkey' : type;
  }
  if (Array.isArray(type)) {
    return type.map(normalizeType);
  }
  if (type.defined) {
    return { defined: normalizeDefinedType(type.defined) };
  }
  if (type.vec) {
    return { vec: normalizeType(type.vec) };
  }
  if (type.option) {
    return { option: normalizeType(type.option) };
  }
  if (type.array) {
    return { array: [normalizeType(type.array[0]), type.array[1]] };
  }
  if (type.kind) {
    return normalizeTypeDef({ type });
  }
  return type;
}

function normalizeTypeDef(typeDefWrapper: any): any {
  const typeDef = typeDefWrapper.type ?? typeDefWrapper;
  if (!typeDef) {
    return typeDefWrapper;
  }

  const copy = { ...typeDef };
  if (copy.kind === 'struct') {
    copy.fields = copy.fields.map((field: any) => ({
      ...field,
      type: normalizeType(field.type),
    }));
  } else if (copy.kind === 'enum') {
    copy.variants = copy.variants.map((variant: any) => {
      if (!variant.fields) {
        return variant;
      }
      if (Array.isArray(variant.fields)) {
        return {
          ...variant,
          fields: variant.fields.map((field: any) => {
            if (typeof field === 'string') {
              return normalizeType(field);
            }
            if (field.type) {
              return {
                ...field,
                type: normalizeType(field.type),
              };
            }
            return field;
          }),
        };
      }
      if (variant.fields.type) {
        return {
          ...variant,
          fields: {
            ...variant.fields,
            type: normalizeType(variant.fields.type),
          },
        };
      }
      return variant;
    });
  }

  return { ...typeDefWrapper, type: copy };
}

function createAccountsCoder(): BorshAccountsCoder {
  const rawIdl = {
    ...(JupiterPerpsIdl as unknown as Record<string, unknown>),
    address: PROGRAM_ID.toBase58(),
  } as unknown as Idl;
  const camelIdl = convertIdlToCamelCase(rawIdl) as any;

  const existingTypes = new Set((camelIdl.types ?? []).map((typeDef: { name: string }) => typeDef.name));
  camelIdl.accounts?.forEach((account: any) => {
    if (!existingTypes.has(account.name)) {
      camelIdl.types = camelIdl.types ?? [];
      camelIdl.types.push(
        normalizeTypeDef({
          name: account.name,
          type: account.type,
        }),
      );
      existingTypes.add(account.name);
    }
    account.type = normalizeType(account.type);
  });

  camelIdl.types = (camelIdl.types ?? []).map((typeDef: any) => normalizeTypeDef(typeDef));

  return new BorshAccountsCoder(camelIdl as Idl);
}

export function createJupiterAccountsCoder(): BorshAccountsCoder {
  return createAccountsCoder();
}

export function createJupiterRpcFetch(): RpcFetch {
  return createRpcFetch();
}

enum BorrowRateMechanism {
  Linear,
  Jump,
}

function bnToNumber(value: BN, decimals = 0): number {
  if (decimals === 0) {
    return Number(value.toString());
  }
  const denominator = 10 ** decimals;
  return Number(value.toString()) / denominator;
}

function divCeil(a: BN, b: BN): BN {
  const dm = a.divmod(b);
  if (dm.mod.isZero()) {
    return dm.div;
  }
  return dm.div.isNeg() ? dm.div.isubn(1) : dm.div.iaddn(1);
}

function getBorrowRateMechanism(custody: JupiterCustodyAccount): BorrowRateMechanism {
  if (!custody.borrowsFundingRateState.hourlyFundingDbps.eqn(0)) {
    return BorrowRateMechanism.Linear;
  }
  return BorrowRateMechanism.Jump;
}

function getDebt(custody: JupiterCustodyAccount): BN {
  return divCeil(BN.max(custody.debt.sub(custody.borrowLendInterestsAccured), new BN(0)), DEBT_POWER);
}

function theoreticallyOwned(custody: JupiterCustodyAccount): BN {
  return custody.assets.owned.add(getDebt(custody));
}

function totalLocked(custody: JupiterCustodyAccount): BN {
  return custody.assets.locked.add(getDebt(custody));
}

function getHourlyBorrowRate(custody: JupiterCustodyAccount, useBorrowCurve = false): BN {
  const mechanism = getBorrowRateMechanism(custody);
  const owned = theoreticallyOwned(custody);
  const locked = totalLocked(custody);

  if (mechanism === BorrowRateMechanism.Linear) {
    const state = useBorrowCurve ? custody.borrowsFundingRateState : custody.fundingRateState;
    const hourlyFundingRate = state.hourlyFundingDbps.mul(RATE_POWER).div(DBPS_POWER);
    if (owned.eqn(0) || locked.eqn(0)) {
      return new BN(0);
    }
    return divCeil(locked.mul(hourlyFundingRate), owned);
  }

  const { minRateBps, maxRateBps, targetRateBps, targetUtilizationRate } = custody.jumpRateState;
  const utilizationRate =
    owned.eqn(0) || locked.eqn(0) ? new BN(0) : locked.mul(RATE_POWER).div(owned);

  if (utilizationRate.lte(targetUtilizationRate)) {
    const yearlyRate = divCeil(
      targetRateBps.sub(minRateBps).mul(utilizationRate),
      targetUtilizationRate,
    )
      .add(minRateBps)
      .mul(RATE_POWER)
      .div(BPS_POWER);
    return yearlyRate.divn(HOURS_IN_YEAR);
  }

  const rateDiff = BN.max(new BN(0), maxRateBps.sub(targetRateBps));
  const utilDiff = BN.max(new BN(0), utilizationRate.sub(targetUtilizationRate));
  const denominator = BN.max(new BN(0), RATE_POWER.sub(targetUtilizationRate));
  if (denominator.eqn(0)) {
    throw new Error('Invalid jump rate configuration: denominator is zero');
  }
  const yearlyRate = divCeil(rateDiff.mul(utilDiff), denominator)
    .add(targetRateBps)
    .mul(RATE_POWER)
    .div(BPS_POWER);
  return yearlyRate.divn(HOURS_IN_YEAR);
}

function computeFundingRates(custody: JupiterCustodyAccount): { hourly: number; annualized: number } {
  const hourlyRate = getHourlyBorrowRate(custody);
  const hourly = hourlyRate.toNumber() / RATE_POWER.toNumber();
  return {
    hourly,
    annualized: hourly * HOURS_IN_YEAR,
  };
}

function buildDepthLevels(markPrice: number, custody: JupiterCustodyAccount): PerpDepthLevel[] {
  if (!Number.isFinite(markPrice) || markPrice <= 0) {
    return [];
  }

  const bidsUsd = bnToNumber(custody.pricing.onePercentDepthBelow, USD_DECIMALS);
  const asksUsd = bnToNumber(custody.pricing.onePercentDepthAbove, USD_DECIMALS);
  const levels: PerpDepthLevel[] = [];
  const levelsPerSide = 3;
  const priceStep = 0.01 / levelsPerSide;

  if (bidsUsd > 0) {
    const totalSize = bidsUsd / markPrice;
    const sizePerLevel = totalSize / levelsPerSide;
    for (let i = 1; i <= levelsPerSide; i += 1) {
      const offset = priceStep * i;
      levels.push({
        side: 'bid',
        price: markPrice * (1 - offset),
        size: sizePerLevel,
      });
    }
  }

  if (asksUsd > 0) {
    const totalSize = asksUsd / markPrice;
    const sizePerLevel = totalSize / levelsPerSide;
    for (let i = 1; i <= levelsPerSide; i += 1) {
      const offset = priceStep * i;
      levels.push({
        side: 'ask',
        price: markPrice * (1 + offset),
        size: sizePerLevel,
      });
    }
  }

  return levels;
}

function getBaseSymbol(mint: PublicKey): string {
  const key = mint.toBase58();
  return MINT_TO_SYMBOL[key] ?? key;
}

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  const rpcUrl = DEFAULT_RPC_URL;
  const poolAddress = DEFAULT_POOL_ADDRESS;
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    fetch: createRpcFetch() as any,
  });
  const poolKey = new PublicKey(poolAddress);

  const coder = createAccountsCoder();

  const poolInfo = await connection.getAccountInfo(poolKey, 'confirmed');
  if (!poolInfo) {
    throw new Error(`Jupiter pool account not found at ${poolAddress}`);
  }

  const pool = coder.decode('pool', poolInfo.data) as JupiterPoolAccount;
  if (!Array.isArray(pool.custodies) || pool.custodies.length === 0) {
    throw new Error('Jupiter pool does not expose any custody accounts');
  }

  const custodyInfos = await connection.getMultipleAccountsInfo(pool.custodies, 'confirmed');
  const custodyRecords: Array<{ data: JupiterCustodyAccount; pubkey: PublicKey }> = [];
  const priceAccounts = new Map<string, PublicKey>();

  custodyInfos.forEach((accountInfo, index) => {
    if (!accountInfo) {
      return;
    }
    const custody = coder.decode('custody', accountInfo.data) as JupiterCustodyAccount;
    custodyRecords.push({ data: custody, pubkey: pool.custodies[index] });
    const oracleAccount = custody.oracle?.oracleAccount;
    if (oracleAccount && custody.oracle.oracleType?.Pyth !== undefined) {
      priceAccounts.set(oracleAccount.toBase58(), oracleAccount);
    }
  });

  if (custodyRecords.length === 0) {
    throw new Error('Failed to decode Jupiter custody accounts');
  }

  const priceKeys = Array.from(priceAccounts.values());
  const priceInfos = priceKeys.length
    ? await connection.getMultipleAccountsInfo(priceKeys, 'confirmed')
    : [];

  const priceMap = new Map<string, ReturnType<typeof parsePythPriceData>>();
  priceInfos.forEach((info, idx) => {
    const key = priceKeys[idx].toBase58();
    if (!info) {
      return;
    }
    try {
      const parsed = parsePythPriceData(info.data);
      priceMap.set(key, parsed);
    } catch (error) {
      console.warn(`[Perp][Jupiter] Unable to parse Pyth account ${key}: ${(error as Error).message}`);
    }
  });

  const currentSlot = await connection.getSlot('confirmed');
  const markets: PerpMarketData[] = [];

  custodyRecords.forEach(({ data: custody }) => {
    const oracleKey = custody.oracle?.oracleAccount?.toBase58();
    if (!oracleKey) {
      return;
    }

    const priceData = priceMap.get(oracleKey);
    if (!priceData || priceData.status !== PriceStatus.Trading) {
      return;
    }

    if (currentSlot - priceData.publishSlot > MAX_PYTH_SLOT_DRIFT) {
      return;
    }

    const markPrice = priceData.price ?? 0;
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return;
    }

    const baseSymbol = getBaseSymbol(custody.mint);
    const symbol = `${baseSymbol}-USD`;
    const openInterestUsd = bnToNumber(
      custody.assets.guaranteedUsd.add(custody.assets.globalShortSizes),
      USD_DECIMALS,
    );

    const funding = computeFundingRates(custody);
    const takerFeeBps = Number(custody.increasePositionBps.toString());
    const makerFeeBps = Number(custody.decreasePositionBps.toString());
    const depthTop5 = buildDepthLevels(markPrice, custody);
    const maxLeverage = custody.pricing.maxLeverage.toNumber() / MAX_LEVERAGE_SCALE;

    markets.push({
      symbol,
      markPrice,
      fundingRateHourly: funding.hourly,
      fundingRateAnnualized: funding.annualized,
      openInterestUsd,
      takerFeeBps,
      makerFeeBps,
      minQty: 0,
      depthTop5,
      extra: {
        mint: custody.mint.toBase58(),
        oracleAccount: oracleKey,
        oracleConfidence: priceData.confidence,
        pricePublishSlot: priceData.publishSlot,
        maxLeverage,
        maxGlobalLongUsd: bnToNumber(custody.pricing.maxGlobalLongSizes, USD_DECIMALS),
        maxGlobalShortUsd: bnToNumber(custody.pricing.maxGlobalShortSizes, USD_DECIMALS),
        poolName: pool.name,
        borrowLimitBps: Number(custody.borrowLendParameters.borrowsLimitInBps.toString()),
        maintainanceMarginBps: Number(
          custody.borrowLendParameters.maintainanceMarginBps.toString(),
        ),
      },
    });
  });

  if (markets.length === 0) {
    throw new Error('All Jupiter markets are stale or unavailable');
  }

  return {
    meta: jupiterConnector.meta,
    markets,
    lastUpdated: new Date().toISOString(),
    source: 'live',
  };
}

const jupiterConnector: PerpConnector = {
  meta: {
    id: 'jupiter_perps',
    name: 'Jupiter Perps',
    description: 'Solana-native perpetuals sourced directly from the Jupiter Perpetuals on-chain program.',
    website: 'https://jup.ag/',
    docs: 'https://station.jup.ag/docs/perps/overview',
    requiresApiKey: false,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;
    const preferLive = ctx?.preferLive ?? false;
    if (useMock) {
      const mock = getMockMarkets('jupiter_perps');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }

    try {
      return await fetchLiveMarkets();
    } catch (error) {
      if (preferLive) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      console.warn('[Perp][Jupiter] Falling back to mock data:', (error as Error).message);
      const mock = getMockMarkets('jupiter_perps');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default jupiterConnector;
