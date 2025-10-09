import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult, PerpDepthLevel } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const DEFAULT_AVANTIS_SOCKET_API_URL = 'https://socket-api-pub.avantisfi.com/socket-api/v1/data';
const DEFAULT_AVANTIS_PYTH_PRICE_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  const socketEndpoint = process.env.AVANTIS_SOCKET_API_URL ?? DEFAULT_AVANTIS_SOCKET_API_URL;
  const priceEndpoint = process.env.AVANTIS_PYTH_PRICE_URL ?? DEFAULT_AVANTIS_PYTH_PRICE_URL;
  const startedAt = Date.now();

  try {
    const response = await axios.get(socketEndpoint, {
      timeout: 10_000,
    });

    const pairInfos = (response.data?.data?.pairInfos ?? {}) as Record<string, any>;
    const listings = (Object.values(pairInfos) as Record<string, any>[]).filter(
      pair => pair?.isPairListed !== false,
    );

    const feedIds = Array.from(
      new Set(
        listings
          .map(pair => {
            const raw = pair?.feed?.feedId;
            return typeof raw === 'string' ? raw.toLowerCase().replace(/^0x/, '') : '';
          })
          .filter(Boolean),
      ),
    );

    const priceMap = await fetchPythPrices(feedIds, priceEndpoint);

    const markets = listings.map(pair => {
      const feedId: string = typeof pair.feed?.feedId === 'string' ? pair.feed.feedId : '';
      const normalizedFeedId = feedId.toLowerCase().replace(/^0x/, '');
      const markPrice = priceMap[normalizedFeedId] ?? 0;
      const minNotional = Number(pair?.pairMinLevPosUSDC ?? pair?.minLevPosUSDC ?? 0);
      const { fundingRateHourly, fundingRateAnnualized } = deriveFundingRates(pair);
      const depthTop5 = buildDepthLevels(markPrice, pair);

      return {
        symbol: `${pair.from ?? 'UNKNOWN'}-${pair.to ?? 'UNKNOWN'}`,
        markPrice,
        fundingRateHourly,
        fundingRateAnnualized,
        openInterestUsd: Number(pair.pairOI ?? 0),
        takerFeeBps: Number(pair.openFeeP ?? 0) * 100,
        makerFeeBps: Number(pair.limitOrderFeeP ?? 0) * 100,
        minQty: markPrice > 0 ? minNotional / markPrice : 0,
        depthTop5,
        extra: {
          feedId,
          backupFeedId: pair?.backupFeed?.feedId,
          groupIndex: pair.groupIndex,
          feeIndex: pair.feeIndex,
          openFeePercent: pair.openFeeP,
          closeFeePercent: pair.closeFeeP,
          limitOrderFeePercent: pair.limitOrderFeeP,
          priceImpactParameter: pair.priceImpactMultiplier,
          skewImpactParameter: pair.skewImpactMultiplier,
          marginFee: pair.marginFee,
          openInterestBreakdown: pair.openInterest,
          pairParams: pair.pairParams,
          lossProtectionMultiplier: pair.lossProtectionMultiplier,
          depthReference: pair.pairParams?.onePercentDepthAbove ?? pair.pairParams?.onePercentDepthBelow ?? 0,
          dataSource: markPrice > 0 ? 'pyth' : 'unavailable',
        },
      };
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[Perp][Avantis] Live pull succeeded: ${markets.length} markets, ${feedIds.length} feeds, ${durationMs}ms`,
    );

    return {
      meta: avantisConnector.meta,
      markets,
      lastUpdated: new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    throw new Error(`Failed to fetch Avantis markets: ${(error as Error).message}`);
  }
}

async function fetchPythPrices(feedIds: string[], endpoint: string): Promise<Record<string, number>> {
  if (!feedIds.length) {
    return {};
  }

  try {
    const response = await axios.get(endpoint, {
      timeout: 10_000,
      params: {
        parsed: 'true',
        'ids[]': feedIds,
      },
    });

    const entries = response.data?.parsed ?? [];
    const prices: Record<string, number> = {};

    for (const entry of entries) {
      const id: string | undefined = typeof entry?.id === 'string' ? entry.id.toLowerCase() : undefined;
      const priceInfo = entry?.price;

      if (!id || !priceInfo) {
        continue;
      }

      const priceValue = Number(priceInfo.price);
      const exponent = Number(priceInfo.expo);

      if (!Number.isFinite(priceValue) || !Number.isFinite(exponent)) {
        continue;
      }

      prices[id] = priceValue * 10 ** exponent;
    }

    return prices;
  } catch (error) {
    console.warn('Failed to fetch Pyth prices for Avantis:', (error as Error).message);
    return {};
  }
}

function deriveFundingRates(pair: Record<string, any>): { fundingRateHourly: number; fundingRateAnnualized: number } {
  const marginLong = Number(pair?.marginFee?.long ?? 0);
  const marginShort = Number(pair?.marginFee?.short ?? 0);
  const directionalComponent = marginLong - marginShort;
  const averageMargin = (marginLong + marginShort) / 2;

  const longOi = Number(pair?.openInterest?.long ?? 0);
  const shortOi = Number(pair?.openInterest?.short ?? 0);
  const skew = longOi - shortOi;
  const skewDirection = skew === 0 ? 0 : skew / Math.abs(skew);

  let hourly = 0;
  if (directionalComponent !== 0) {
    hourly = directionalComponent / 24;
  } else if (averageMargin > 0 && skewDirection !== 0) {
    hourly = (averageMargin / 24) * skewDirection;
  }

  const annualized = hourly * 24 * 365;
  return {
    fundingRateHourly: hourly,
    fundingRateAnnualized: annualized,
  };
}

function buildDepthLevels(markPrice: number, pair: Record<string, any>): PerpDepthLevel[] {
  if (!Number.isFinite(markPrice) || markPrice <= 0) {
    return [];
  }

  const params = pair?.pairParams ?? {};
  const depthBelowUsd = Number(params?.onePercentDepthBelow ?? 0);
  const depthAboveUsd = Number(params?.onePercentDepthAbove ?? 0);

  const levels: PerpDepthLevel[] = [];
  const LEVELS_PER_SIDE = 3;
  const priceStepPercent = 0.01 / LEVELS_PER_SIDE;

  if (depthBelowUsd > 0) {
    const totalSize = depthBelowUsd / markPrice;
    const perLevelSize = totalSize / LEVELS_PER_SIDE;
    for (let i = 1; i <= LEVELS_PER_SIDE; i += 1) {
      const priceOffset = priceStepPercent * i;
      levels.push({
        side: 'bid',
        price: markPrice * (1 - priceOffset),
        size: perLevelSize,
      });
    }
  }

  if (depthAboveUsd > 0) {
    const totalSize = depthAboveUsd / markPrice;
    const perLevelSize = totalSize / LEVELS_PER_SIDE;
    for (let i = 1; i <= LEVELS_PER_SIDE; i += 1) {
      const priceOffset = priceStepPercent * i;
      levels.push({
        side: 'ask',
        price: markPrice * (1 + priceOffset),
        size: perLevelSize,
      });
    }
  }

  return levels.slice(0, 10);
}

const avantisConnector: PerpConnector = {
  meta: {
    id: 'avantis',
    name: 'Avantis',
    description: 'Base-native perpetuals with synthetic markets and fee-sharing vaults.',
    website: 'https://www.avantisfi.com/',
    docs: 'https://sdk.avantisfi.com/',
    requiresApiKey: false,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;
    const preferLive = ctx?.preferLive ?? false;
    if (useMock) {
      const mock = getMockMarkets('avantis');
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
      console.warn('[Perp][Avantis] Falling back to mock data:', (error as Error).message);
      const mock = getMockMarkets('avantis');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default avantisConnector;
export { deriveFundingRates, buildDepthLevels };
