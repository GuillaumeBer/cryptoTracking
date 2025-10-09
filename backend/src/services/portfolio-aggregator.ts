/**
 * Portfolio Aggregator Service
 *
 * Aggregates asset balances across multiple blockchains:
 * - EVM chains (8): Arbitrum, BSC, Base, Polygon, Avalanche, Ethereum, Optimism
 * - Solana: Full SPL token support
 * - Cosmos ecosystem (4): Cosmos Hub, Osmosis, Celestia, Injective (with staking)
 * - Sui: Native + custom tokens
 */

import axios from 'axios';

// Configuration
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';
const SOLANA_ADDRESS = process.env.SOLANA_ADDRESS || 'Fm8iU5JFusdGKs6Lyjpa8Yoy399crzaNMq62XwLmBCDa';
const SUI_ADDRESS = process.env.SUI_ADDRESS || '0xb8dfd1a4c76139d5b286502cdd15a0357aaed13d26c7534f0c48550ab8e26c02';

// Cosmos addresses
const COSMOS_ADDRESSES = {
  cosmos: process.env.COSMOS_ADDRESS || 'cosmos189d03pzrzcv2yp289nsau3cef9223e24pyu0ax',
  osmosis: process.env.OSMOSIS_ADDRESS || 'osmo189d03pzrzcv2yp289nsau3cef9223e24fl0lt5',
  celestia: process.env.CELESTIA_ADDRESS || 'celestia189d03pzrzcv2yp289nsau3cef9223e24swdl8t',
  injective: process.env.INJECTIVE_ADDRESS || 'inj1q0mu6k7pjkfa3sc9qplx9zg0u3lk5fh2qaec2z',
};

// Cosmos REST APIs
const COSMOS_REST_APIS = {
  cosmos: 'https://cosmos-rest.publicnode.com',
  osmosis: 'https://osmosis-rest.publicnode.com',
  celestia: 'https://celestia-rest.publicnode.com',
  injective: 'https://sentry.lcd.injective.network:443',
};

// Cosmos native tokens
const COSMOS_NATIVE_TOKENS = {
  cosmos: { denom: 'uatom', symbol: 'ATOM', decimals: 6, name: 'Cosmos Hub' },
  osmosis: { denom: 'uosmo', symbol: 'OSMO', decimals: 6, name: 'Osmosis' },
  celestia: { denom: 'utia', symbol: 'TIA', decimals: 6, name: 'Celestia' },
  injective: { denom: 'inj', symbol: 'INJ', decimals: 18, name: 'Injective' },
};

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SUI_RPC = 'https://fullnode.mainnet.sui.io:443';

export interface TokenBalance {
  name: string;
  symbol: string;
  balance: number;
  price: number;
  valueUsd: number;
  address: string;
  chain: string;
  type?: 'balance' | 'staked';
}

export interface ChainBalance {
  chain: string;
  totalValue: number;
  tokens: TokenBalance[];
}

export interface PortfolioSummary {
  totalValue: number;
  chains: ChainBalance[];
  timestamp: Date;
}

class PortfolioAggregator {
  private priceApiUrl = 'http://localhost:3001/api/prices';
  private readonly priceCache = new Map<string, { value: number; expires: number }>();
  private readonly contractPriceCache = new Map<string, { value: number; expires: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Get complete portfolio across all chains
   */
  async getPortfolio(): Promise<PortfolioSummary> {
    const chains: ChainBalance[] = [];

    // EVM chains via Moralis
    const evmChains = ['arbitrum', 'bsc', 'base', 'polygon', 'avalanche', 'eth', 'optimism'];
    const evmResults = await Promise.allSettled(
      evmChains.map(async (chain) => ({ chain, tokens: await this.getEvmChainTokens(chain, WALLET_ADDRESS) }))
    );

    for (const result of evmResults) {
      if (result.status === 'fulfilled' && result.value.tokens.length > 0) {
        chains.push({
          chain: result.value.chain,
          totalValue: result.value.tokens.reduce((sum, t) => sum + t.valueUsd, 0),
          tokens: result.value.tokens,
        });
      } else if (result.status === 'rejected') {
        console.error('EVM chain aggregation failed:', result.reason);
      }
    }

    const [solanaResult, cosmosResults, suiResult] = await Promise.all([
      this.safeChainAggregation('solana', () => this.getSolanaTokens(SOLANA_ADDRESS)),
      this.aggregateCosmosChains(),
      this.safeChainAggregation('sui', () => this.getSuiTokens(SUI_ADDRESS)),
    ]);

    if (solanaResult) {
      chains.push(solanaResult);
    }

    for (const chainResult of cosmosResults) {
      if (chainResult) {
        chains.push(chainResult);
      }
    }

    if (suiResult) {
      chains.push(suiResult);
    }

    const totalValue = chains.reduce((sum, c) => sum + c.totalValue, 0);

    return {
      totalValue,
      chains,
      timestamp: new Date(),
    };
  }

  /**
   * Check if user has specific token balance
   */
  async hasToken(symbol: string, minBalance: number = 0): Promise<{ hasToken: boolean; balance: number; chain?: string }> {
    const portfolio = await this.getPortfolio();

    for (const chain of portfolio.chains) {
      for (const token of chain.tokens) {
        if (token.symbol.toLowerCase() === symbol.toLowerCase() && token.balance >= minBalance) {
          return {
            hasToken: true,
            balance: token.balance,
            chain: chain.chain,
          };
        }
      }
    }

    return { hasToken: false, balance: 0 };
  }

  /**
   * Get total balance of specific token across all chains
   */
  async getTokenBalance(symbol: string): Promise<{ totalBalance: number; chains: Array<{ chain: string; balance: number }> }> {
    const portfolio = await this.getPortfolio();
    const chainBalances: Array<{ chain: string; balance: number }> = [];
    let totalBalance = 0;

    for (const chain of portfolio.chains) {
      for (const token of chain.tokens) {
        if (token.symbol.toLowerCase() === symbol.toLowerCase()) {
          chainBalances.push({
            chain: chain.chain,
            balance: token.balance,
          });
          totalBalance += token.balance;
        }
      }
    }

    return { totalBalance, chains: chainBalances };
  }

  /**
   * Fetch EVM chain tokens via Moralis
   */
  private async getEvmChainTokens(chain: string, address: string): Promise<TokenBalance[]> {
    try {
      const response = await this.requestWithRetry(
        () =>
          axios.get(`https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`, {
            params: {
              chain,
              exclude_spam: 'true',
              exclude_unverified_contracts: 'true',
            },
            headers: {
              'X-API-Key': MORALIS_API_KEY,
              accept: 'application/json',
            },
            timeout: 30000,
          }),
        `moralis-${chain}`
      );

      const tokens: TokenBalance[] = [];
      const moralisTokens = response.data.result || [];

      for (const token of moralisTokens) {
        const balance = parseFloat(token.balance_formatted || '0');
        const price = parseFloat(token.usd_price || '0');
        const value = parseFloat(token.usd_value || balance * price);

        if (balance > 0 && value > 5) {
          tokens.push({
            name: token.name || 'Unknown',
            symbol: token.symbol || 'UNKNOWN',
            balance,
            price,
            valueUsd: value,
            address: token.token_address || 'native',
            chain,
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error(`Error fetching ${chain} tokens:`, error);
      return [];
    }
  }

  /**
   * Fetch Solana tokens via Moralis
   */
  private async getSolanaTokens(address: string): Promise<TokenBalance[]> {
    const tokens: TokenBalance[] = [];

    try {
      // Get native SOL
      const solResponse = await this.requestWithRetry(
        () =>
          axios.post(
            SOLANA_RPC,
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'getBalance',
              params: [address, { commitment: 'confirmed' }],
            },
            { timeout: 15000 }
          ),
        'solana-balance'
      );

      if (solResponse.data?.result?.value) {
        const solBalance = solResponse.data.result.value / 1e9;
        const solPrice = await this.getTokenPrice('SOL');
        const solValue = solBalance * solPrice;

        if (solValue > 5) {
          tokens.push({
            name: 'Solana',
            symbol: 'SOL',
            balance: solBalance,
            price: solPrice,
            valueUsd: solValue,
            address: 'native',
            chain: 'solana',
          });
        }
      }

      // Get SPL tokens from Moralis
      const response = await this.requestWithRetry(
        () =>
          axios.get(`https://solana-gateway.moralis.io/account/mainnet/${address}/tokens`, {
            headers: {
              'X-API-Key': MORALIS_API_KEY,
              accept: 'application/json',
            },
            timeout: 20000,
          }),
        'solana-spl-tokens'
      );

      const splTokens = response.data || [];
      const mints = splTokens.map((t: any) => t.mint).filter(Boolean);

      if (mints.length > 0) {
        const prices = await this.getContractPrices('solana', mints);

        for (const token of splTokens) {
          if (token.mint === 'So11111111111111111111111111111111111111112') continue;

          const balance = parseFloat(token.amount || '0');
          const price = prices[token.mint?.toLowerCase()] || 0;
          const value = balance * price;

          if (balance > 0 && value > 5 && price > 0) {
            tokens.push({
              name: token.name || 'Unknown',
              symbol: token.symbol || 'UNKNOWN',
              balance,
              price,
              valueUsd: value,
              address: token.mint,
              chain: 'solana',
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Solana tokens:', error);
    }

    return tokens;
  }

  /**
   * Fetch Cosmos chain tokens (including staking)
   */
  private async getCosmosChainTokens(chain: string, address: string): Promise<TokenBalance[]> {
    const tokens: TokenBalance[] = [];
    const restApi = COSMOS_REST_APIS[chain as keyof typeof COSMOS_REST_APIS];
    const nativeToken = COSMOS_NATIVE_TOKENS[chain as keyof typeof COSMOS_NATIVE_TOKENS];

    if (!restApi || !nativeToken) return tokens;

    try {
      // Get balances
      const balancesResponse = await this.requestWithRetry(
        () => axios.get(`${restApi}/cosmos/bank/v1beta1/balances/${address}`, { timeout: 20000 }),
        `${chain}-balances`
      );
      const balances = balancesResponse.data.balances || [];

      for (const balance of balances) {
        if (balance.denom === nativeToken.denom) {
          const amount = parseInt(balance.amount) / Math.pow(10, nativeToken.decimals);
          const price = await this.getTokenPrice(nativeToken.symbol);
          const value = amount * price;

          if (value > 5) {
            tokens.push({
              name: nativeToken.name,
              symbol: nativeToken.symbol,
              balance: amount,
              price,
              valueUsd: value,
              address: 'native',
              chain,
              type: 'balance',
            });
          }
        }
      }

      // Get staking delegations
      const delegationsResponse = await this.requestWithRetry(
        () => axios.get(`${restApi}/cosmos/staking/v1beta1/delegations/${address}`, { timeout: 20000 }),
        `${chain}-delegations`
      );
      const delegations = delegationsResponse.data.delegation_responses || [];

      let totalStaked = 0;
      for (const delegation of delegations) {
        if (delegation.balance?.denom === nativeToken.denom) {
          totalStaked += parseInt(delegation.balance.amount);
        }
      }

      if (totalStaked > 0) {
        const stakedAmount = totalStaked / Math.pow(10, nativeToken.decimals);
        const price = await this.getTokenPrice(nativeToken.symbol);
        const value = stakedAmount * price;

        if (value > 5) {
          tokens.push({
            name: `${nativeToken.name} (Staked)`,
            symbol: `${nativeToken.symbol} (Staked)`,
            balance: stakedAmount,
            price,
            valueUsd: value,
            address: 'staked',
            chain,
            type: 'staked',
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching ${chain} tokens:`, error);
    }

    return tokens;
  }

  /**
   * Fetch Sui tokens
   */
  private async getSuiTokens(address: string): Promise<TokenBalance[]> {
    const tokens: TokenBalance[] = [];

    try {
      const response = await this.requestWithRetry(
        () =>
          axios.post(
            SUI_RPC,
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'suix_getAllBalances',
              params: [address],
            },
            { timeout: 20000 }
          ),
        'sui-balances'
      );

      const balances = response.data.result || [];
      const nonZeroBalances = balances.filter((b: any) => parseInt(b.totalBalance) > 0);

      for (const balanceInfo of nonZeroBalances) {
        const coinType = balanceInfo.coinType;
        const totalBalanceRaw = parseInt(balanceInfo.totalBalance);

        // Get metadata
        const metadataResponse = await this.requestWithRetry(
          () =>
            axios.post(
              SUI_RPC,
              {
                jsonrpc: '2.0',
                id: 1,
                method: 'suix_getCoinMetadata',
                params: [coinType],
              },
              { timeout: 20000 }
            ),
          'sui-metadata'
        );

        const metadata = metadataResponse.data.result;
        if (!metadata) continue;

        const symbol = metadata.symbol || 'UNKNOWN';
        const name = metadata.name || 'Unknown';
        const decimals = metadata.decimals || 9;

        // Filter reward tokens
        const isRewardToken =
          symbol.toLowerCase().includes('reward') ||
          name.toLowerCase().includes('reward') ||
          symbol.startsWith('$') ||
          symbol.toLowerCase().includes('.cc') ||
          symbol.toLowerCase().includes('.io') ||
          symbol.toUpperCase() === 'HUSKI';

        const balance = totalBalanceRaw / Math.pow(10, decimals);
        const price = await this.getTokenPrice(symbol);

        // Skip reward tokens with default price
        if (isRewardToken && price === 1) continue;

        const value = balance * price;

        if (balance > 0 && value > 5) {
          tokens.push({
            name,
            symbol,
            balance,
            price,
            valueUsd: value,
            address: coinType,
            chain: 'sui',
          });
        }

        // Small delay to avoid rate limiting
        await this.sleep(100);
      }
    } catch (error) {
      console.error('Error fetching Sui tokens:', error);
    }

    return tokens;
  }

  /**
   * Get token price by symbol from local price API
   */
  private async getTokenPrice(symbol: string): Promise<number> {
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const cached = this.priceCache.get(normalizedSymbol);
      if (cached && cached.expires > Date.now()) {
        return cached.value;
      }

      const response = await this.requestWithRetry(
        () => axios.get(`${this.priceApiUrl}/token/${normalizedSymbol}`, { timeout: 10000 }),
        `price-${normalizedSymbol}`
      );
      const price = response.data.price || 0;
      this.priceCache.set(normalizedSymbol, { value: price, expires: Date.now() + this.cacheTtlMs });
      return price;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get prices for multiple contract addresses
   */
  private async getContractPrices(platform: string, addresses: string[]): Promise<{ [address: string]: number }> {
    try {
      const normalizedAddresses = addresses.map((address) => address.toLowerCase());
      const prices: { [address: string]: number } = {};
      const missingAddresses: string[] = [];

      for (const address of normalizedAddresses) {
        const cached = this.contractPriceCache.get(address);
        if (cached && cached.expires > Date.now()) {
          prices[address] = cached.value;
        } else {
          missingAddresses.push(address);
        }
      }

      if (missingAddresses.length === 0) {
        return prices;
      }

      const response = await this.requestWithRetry(
        () =>
          axios.post(
            `${this.priceApiUrl}/contracts/${platform}`,
            { addresses: missingAddresses },
            { timeout: 120000 }
          ),
        `contract-prices-${platform}`
      );

      for (const [address, data] of Object.entries(response.data || {})) {
        const normalizedAddress = address.toLowerCase();
        const price = (data as any).price || 0;
        prices[normalizedAddress] = price;
        this.contractPriceCache.set(normalizedAddress, {
          value: price,
          expires: Date.now() + this.cacheTtlMs,
        });
      }

      // Ensure we always return entries for requested addresses
      for (const address of normalizedAddresses) {
        if (!(address in prices)) {
          prices[address] = 0;
        }
      }

      return prices;
    } catch (error) {
      console.error(`Error fetching contract prices for ${platform}:`, error);
      return {};
    }
  }

  private async safeChainAggregation(
    chain: string,
    loader: () => Promise<TokenBalance[]>
  ): Promise<ChainBalance | null> {
    try {
      const tokens = await loader();
      if (tokens.length === 0) {
        return null;
      }

      return {
        chain,
        totalValue: tokens.reduce((sum, t) => sum + t.valueUsd, 0),
        tokens,
      };
    } catch (error) {
      console.error(`Chain aggregation failed for ${chain}:`, error);
      return null;
    }
  }

  private async aggregateCosmosChains(): Promise<Array<ChainBalance | null>> {
    const cosmosEntries = Object.entries(COSMOS_ADDRESSES);
    const results = await Promise.all(
      cosmosEntries.map(([chain, address]) => this.safeChainAggregation(chain, () => this.getCosmosChainTokens(chain, address)))
    );

    return results;
  }

  private async requestWithRetry<T>(request: () => Promise<T>, context: string, retries = 2): Promise<T> {
    let attempt = 0;
    let delayMs = 500;

    while (true) {
      try {
        return await request();
      } catch (error) {
        attempt += 1;
        if (attempt > retries || !this.isRetryableError(error)) {
          throw error;
        }

        console.warn(`Request failed for ${context}, retrying attempt ${attempt}/${retries}...`);
        await this.sleep(delayMs);
        delayMs *= 2;
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (!status) {
        // Network/timeout errors
        return true;
      }

      return status >= 500 || status === 429;
    }

    return false;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const portfolioAggregator = new PortfolioAggregator();
