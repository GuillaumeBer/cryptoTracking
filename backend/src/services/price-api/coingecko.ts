import axios from 'axios';
import { priceApiConfig } from '../../config/price-api.config';

/**
 * Rate Limiter using Token Bucket Algorithm
 * CoinGecko Free Tier: 10-30 calls/minute (we'll use conservative 10/min = 1 call per 6 seconds)
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = maxRequestsPerMinute / (60 * 1000); // tokens per ms
  }

  private refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitTime = (1 - this.tokens) / this.refillRate;
    console.log(`⏳ CoinGecko rate limit: waiting ${Math.ceil(waitTime / 1000)}s`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    this.tokens = 0; // Consume the token
  }

  reset() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

interface PriceData {
  usd: number;
}

interface CachedPrice {
  price: number;
  timestamp: number;
}

/**
 * Centralized CoinGecko API Service
 * Features:
 * - Rate limiting (10 calls/min for free tier)
 * - Response caching (5 min default TTL)
 * - Batch requests support
 * - Automatic retry with exponential backoff
 */
export class CoinGeckoService {
  private static instance: CoinGeckoService;
  private rateLimiter: RateLimiter;
  private cache: Map<string, CachedPrice> = new Map();
  private readonly cacheTTL: number;
  private readonly baseUrl: string = 'https://api.coingecko.com/api/v3';

  private constructor() {
    const config = priceApiConfig.coingecko;
    this.rateLimiter = new RateLimiter(config.rateLimit.maxRequestsPerMinute);
    this.cacheTTL = config.cache.ttl;
    console.log(`✅ CoinGecko service initialized: ${config.rateLimit.maxRequestsPerMinute} req/min, ${config.cache.ttl / 1000}s cache`);
  }

  static getInstance(): CoinGeckoService {
    if (!CoinGeckoService.instance) {
      CoinGeckoService.instance = new CoinGeckoService();
    }
    return CoinGeckoService.instance;
  }

  /**
   * Get cached price or return null if expired/not found
   */
  private getCachedPrice(key: string): number | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.price;
  }

  /**
   * Cache a price
   */
  private setCachedPrice(key: string, price: number): void {
    this.cache.set(key, {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * Make API request with rate limiting and retry logic
   */
  private async makeRequest<T>(
    url: string,
    maxRetries: number = priceApiConfig.coingecko.retry.maxRetries
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire();

        const response = await axios.get<T>(url, {
          headers: {
            'Accept': 'application/json',
          },
          timeout: 10000,
        });

        return response.data;
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error (HTTP 429)
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
          console.warn(`⚠️ CoinGecko rate limited, retrying after ${waitTime / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // For other errors, use exponential backoff
        if (attempt < maxRetries - 1) {
          const backoffTime = Math.pow(2, attempt) * priceApiConfig.coingecko.retry.baseDelayMs;
          console.warn(`⚠️ CoinGecko request failed (attempt ${attempt + 1}), retrying after ${backoffTime / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    console.error('❌ CoinGecko request failed after retries:', lastError?.message);
    return null;
  }

  /**
   * Get price for a single token by contract address
   * @param platform - Blockchain platform (e.g., 'binance-smart-chain', 'ethereum')
   * @param contractAddress - Token contract address
   */
  async getTokenPrice(platform: string, contractAddress: string): Promise<number | null> {
    const cacheKey = `${platform}:${contractAddress.toLowerCase()}`;

    // Check cache first
    const cachedPrice = this.getCachedPrice(cacheKey);
    if (cachedPrice !== null) {
      console.log(`💾 CoinGecko cache hit: ${contractAddress.slice(0, 10)}... = $${cachedPrice}`);
      return cachedPrice;
    }

    const url = `${this.baseUrl}/simple/token_price/${platform}?contract_addresses=${contractAddress.toLowerCase()}&vs_currencies=usd`;
    const data = await this.makeRequest<{ [address: string]: PriceData }>(url);

    if (!data) {
      return null;
    }

    const priceData = data[contractAddress.toLowerCase()];
    if (!priceData?.usd) {
      return null;
    }

    const price = priceData.usd;
    this.setCachedPrice(cacheKey, price);
    console.log(`🔄 CoinGecko API call: ${contractAddress.slice(0, 10)}... = $${price}`);

    return price;
  }

  /**
   * Get prices for multiple tokens by contract addresses (batched)
   * @param platform - Blockchain platform (e.g., 'binance-smart-chain', 'ethereum')
   * @param contractAddresses - Array of token contract addresses
   */
  async getTokenPrices(
    platform: string,
    contractAddresses: string[]
  ): Promise<{ [address: string]: number }> {
    const result: { [address: string]: number } = {};
    const uncachedAddresses: string[] = [];

    // Check cache for each address
    for (const address of contractAddresses) {
      const cacheKey = `${platform}:${address.toLowerCase()}`;
      const cachedPrice = this.getCachedPrice(cacheKey);

      if (cachedPrice !== null) {
        result[address.toLowerCase()] = cachedPrice;
      } else {
        uncachedAddresses.push(address);
      }
    }

    if (uncachedAddresses.length === 0) {
      console.log(`💾 CoinGecko: all ${contractAddresses.length} prices from cache`);
      return result;
    }

    console.log(`💾 CoinGecko: ${result.length} cached, fetching ${uncachedAddresses.length} prices`);

    // CoinGecko supports up to ~100 addresses per request, but we'll use smaller batches for safety
    const batchSize = priceApiConfig.coingecko.batch.maxAddressesPerBatch;
    for (let i = 0; i < uncachedAddresses.length; i += batchSize) {
      const batch = uncachedAddresses.slice(i, i + batchSize);
      const addressesParam = batch.map(a => a.toLowerCase()).join(',');

      const url = `${this.baseUrl}/simple/token_price/${platform}?contract_addresses=${addressesParam}&vs_currencies=usd`;
      const data = await this.makeRequest<{ [address: string]: PriceData }>(url);

      if (data) {
        for (const [address, priceData] of Object.entries(data)) {
          if (priceData?.usd) {
            const price = priceData.usd;
            result[address] = price;
            this.setCachedPrice(`${platform}:${address}`, price);
          }
        }
      }
    }

    console.log(`🔄 CoinGecko API: fetched ${Object.keys(result).length}/${contractAddresses.length} prices`);
    return result;
  }

  /**
   * Get price for a coin by CoinGecko ID
   * @param coinId - CoinGecko coin ID (e.g., 'bitcoin', 'ethereum')
   */
  async getCoinPrice(coinId: string): Promise<number | null> {
    const cacheKey = `coin:${coinId}`;

    // Check cache first
    const cachedPrice = this.getCachedPrice(cacheKey);
    if (cachedPrice !== null) {
      console.log(`💾 CoinGecko cache hit: ${coinId} = $${cachedPrice}`);
      return cachedPrice;
    }

    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const data = await this.makeRequest<{ [id: string]: PriceData }>(url);

    if (!data || !data[coinId]?.usd) {
      return null;
    }

    const price = data[coinId].usd;
    this.setCachedPrice(cacheKey, price);
    console.log(`🔄 CoinGecko API call: ${coinId} = $${price}`);

    return price;
  }

  /**
   * Get prices for multiple coins by CoinGecko IDs (batched)
   * @param coinIds - Array of CoinGecko coin IDs
   */
  async getCoinPrices(coinIds: string[]): Promise<{ [id: string]: number }> {
    const result: { [id: string]: number } = {};
    const uncachedIds: string[] = [];

    // Check cache for each ID
    for (const id of coinIds) {
      const cacheKey = `coin:${id}`;
      const cachedPrice = this.getCachedPrice(cacheKey);

      if (cachedPrice !== null) {
        result[id] = cachedPrice;
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      console.log(`💾 CoinGecko: all ${coinIds.length} coin prices from cache`);
      return result;
    }

    console.log(`💾 CoinGecko: ${Object.keys(result).length} cached, fetching ${uncachedIds.length} prices`);

    // CoinGecko supports many IDs per request, but we'll batch for safety
    const batchSize = priceApiConfig.coingecko.batch.maxIdsPerBatch;
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');

      const url = `${this.baseUrl}/simple/price?ids=${idsParam}&vs_currencies=usd`;
      const data = await this.makeRequest<{ [id: string]: PriceData }>(url);

      if (data) {
        for (const [id, priceData] of Object.entries(data)) {
          if (priceData?.usd) {
            const price = priceData.usd;
            result[id] = price;
            this.setCachedPrice(`coin:${id}`, price);
          }
        }
      }
    }

    console.log(`🔄 CoinGecko API: fetched ${Object.keys(result).length}/${coinIds.length} coin prices`);
    return result;
  }

  /**
   * Clear all cached prices
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ CoinGecko cache cleared');
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
    console.log('🔄 CoinGecko rate limiter reset');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const coinGeckoService = CoinGeckoService.getInstance();
