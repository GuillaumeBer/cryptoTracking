import axios from 'axios';
import { priceApiConfig } from '../../config/price-api.config';

/**
 * Rate Limiter using Token Bucket Algorithm
 * Binance API: Weight-based rate limiting
 * - 1200 weight per minute for general endpoints
 * - Most price endpoints have weight 1-2
 * We'll use conservative 100 requests/minute = 1.67 req/sec
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
    console.log(`⏳ Binance rate limit: waiting ${Math.ceil(waitTime / 1000)}s`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    this.tokens = 0; // Consume the token
  }

  reset() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

interface BinanceTicker {
  symbol: string;
  price: string;
}

interface CachedPrice {
  price: number;
  timestamp: number;
}

/**
 * Centralized Binance Price API Service
 * Features:
 * - Rate limiting (100 calls/min, conservative for weight limits)
 * - Response caching (1 min default TTL for high liquidity)
 * - Batch fetching (all prices in one call)
 * - Automatic retry with exponential backoff
 */
export class BinancePriceService {
  private static instance: BinancePriceService;
  private rateLimiter: RateLimiter;
  private cache: Map<string, CachedPrice> = new Map();
  private allPricesCache: { prices: { [symbol: string]: number }; timestamp: number } | null = null;
  private readonly cacheTTL: number;
  private readonly baseUrl: string = 'https://api.binance.us/api/v3';

  private constructor() {
    const config = priceApiConfig.binance;
    this.rateLimiter = new RateLimiter(config.rateLimit.maxRequestsPerMinute);
    this.cacheTTL = config.cache.ttl;
    console.log(`✅ Binance Price service initialized: ${config.rateLimit.maxRequestsPerMinute} req/min, ${config.cache.ttl / 1000}s cache`);
  }

  static getInstance(): BinancePriceService {
    if (!BinancePriceService.instance) {
      BinancePriceService.instance = new BinancePriceService();
    }
    return BinancePriceService.instance;
  }

  /**
   * Get cached price or return null if expired/not found
   */
  private getCachedPrice(symbol: string): number | null {
    const cached = this.cache.get(symbol);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.cache.delete(symbol);
      return null;
    }

    return cached.price;
  }

  /**
   * Cache a price
   */
  private setCachedPrice(symbol: string, price: number): void {
    this.cache.set(symbol, {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * Make API request with rate limiting and retry logic
   */
  private async makeRequest<T>(
    url: string,
    maxRetries: number = priceApiConfig.binance.retry.maxRetries
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire();

        const response = await axios.get<T>(url, {
          timeout: 10000,
        });

        return response.data;
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error (HTTP 429 or 418)
        if (error.response?.status === 429 || error.response?.status === 418) {
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 2000;
          console.warn(`⚠️ Binance rate limited, retrying after ${waitTime / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // For other errors, use exponential backoff
        if (attempt < maxRetries - 1) {
          const backoffTime = Math.pow(2, attempt) * priceApiConfig.binance.retry.baseDelayMs;
          console.warn(`⚠️ Binance request failed (attempt ${attempt + 1}), retrying after ${backoffTime / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    console.error('❌ Binance request failed after retries:', lastError?.message);
    return null;
  }

  /**
   * Fetch all prices from Binance (highly efficient - single API call)
   * This should be used as the primary method for getting multiple prices
   */
  async getAllPrices(forceRefresh: boolean = false): Promise<{ [symbol: string]: number }> {
    const now = Date.now();

    // Check if cached all-prices data is still valid
    if (
      !forceRefresh &&
      this.allPricesCache &&
      now - this.allPricesCache.timestamp < this.cacheTTL
    ) {
      console.log(`💾 Binance: using cached all-prices data (${Object.keys(this.allPricesCache.prices).length} pairs)`);
      return this.allPricesCache.prices;
    }

    console.log('🔄 Binance: fetching all prices...');
    const url = `${this.baseUrl}/ticker/price`;
    const data = await this.makeRequest<BinanceTicker[]>(url);

    if (!data) {
      // Return cached data if available, even if expired
      if (this.allPricesCache) {
        console.warn('⚠️ Using stale Binance cache due to API failure');
        return this.allPricesCache.prices;
      }
      return {};
    }

    const prices: { [symbol: string]: number } = {};
    for (const ticker of data) {
      const price = parseFloat(ticker.price);
      prices[ticker.symbol] = price;
      // Also cache individual symbols
      this.setCachedPrice(ticker.symbol, price);
    }

    this.allPricesCache = { prices, timestamp: now };
    console.log(`✅ Binance: cached ${Object.keys(prices).length} price pairs`);

    return prices;
  }

  /**
   * Get price for a single symbol
   * @param symbol - Binance trading pair (e.g., 'BTCUSDT', 'ETHUSDT')
   */
  async getPrice(symbol: string): Promise<number | null> {
    // Check individual cache first
    const cached = this.getCachedPrice(symbol);
    if (cached !== null) {
      console.log(`💾 Binance cache hit: ${symbol} = $${cached}`);
      return cached;
    }

    // Try to get from all-prices cache
    const allPrices = await this.getAllPrices();
    if (allPrices[symbol]) {
      console.log(`💾 Binance from all-prices cache: ${symbol} = $${allPrices[symbol]}`);
      return allPrices[symbol];
    }

    // If not in batch, fetch individually (rare case)
    console.log(`🔄 Binance: fetching individual price for ${symbol}`);
    const url = `${this.baseUrl}/ticker/price?symbol=${symbol}`;
    const data = await this.makeRequest<BinanceTicker>(url);

    if (!data) {
      return null;
    }

    const price = parseFloat(data.price);
    this.setCachedPrice(symbol, price);
    console.log(`🔄 Binance API call: ${symbol} = $${price}`);

    return price;
  }

  /**
   * Get prices for multiple symbols
   * Uses the efficient getAllPrices() method and filters results
   * @param symbols - Array of Binance trading pairs
   */
  async getPrices(symbols: string[]): Promise<{ [symbol: string]: number }> {
    const allPrices = await this.getAllPrices();
    const result: { [symbol: string]: number } = {};

    for (const symbol of symbols) {
      if (allPrices[symbol] !== undefined) {
        result[symbol] = allPrices[symbol];
      }
    }

    console.log(`💾 Binance: found ${Object.keys(result).length}/${symbols.length} requested symbols`);
    return result;
  }

  /**
   * Get USD price for a token symbol by trying common trading pairs
   * @param tokenSymbol - Token symbol (e.g., 'BTC', 'ETH', 'BNB')
   * @returns USD price or null if not found
   */
  async getTokenUsdPrice(tokenSymbol: string): Promise<number | null> {
    const pairs = [
      `${tokenSymbol}USDT`,
      `${tokenSymbol}BUSD`,
      `${tokenSymbol}USD`,
      `${tokenSymbol}USDC`,
    ];

    const allPrices = await this.getAllPrices();

    for (const pair of pairs) {
      if (allPrices[pair]) {
        console.log(`💾 Binance: ${tokenSymbol} price from ${pair} = $${allPrices[pair]}`);
        return allPrices[pair];
      }
    }

    // Try with common reverse pairs (e.g., for stablecoins)
    const reversePairs = [
      `USDT${tokenSymbol}`,
      `BUSD${tokenSymbol}`,
    ];

    for (const pair of reversePairs) {
      if (allPrices[pair]) {
        const reversePrice = 1 / allPrices[pair];
        console.log(`💾 Binance: ${tokenSymbol} price from reverse ${pair} = $${reversePrice}`);
        return reversePrice;
      }
    }

    return null;
  }

  /**
   * Get USD prices for multiple tokens
   * @param tokenSymbols - Array of token symbols
   */
  async getTokenUsdPrices(tokenSymbols: string[]): Promise<{ [symbol: string]: number }> {
    const allPrices = await this.getAllPrices();
    const result: { [symbol: string]: number } = {};

    for (const symbol of tokenSymbols) {
      const pairs = [
        `${symbol}USDT`,
        `${symbol}BUSD`,
        `${symbol}USD`,
        `${symbol}USDC`,
      ];

      for (const pair of pairs) {
        if (allPrices[pair]) {
          result[symbol] = allPrices[pair];
          break;
        }
      }
    }

    console.log(`💾 Binance: found ${Object.keys(result).length}/${tokenSymbols.length} token prices`);
    return result;
  }

  /**
   * Clear all cached prices
   */
  clearCache(): void {
    this.cache.clear();
    this.allPricesCache = null;
    console.log('🗑️ Binance price cache cleared');
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
    console.log('🔄 Binance price rate limiter reset');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { individualPrices: number; allPricesCached: boolean; allPricesCount: number } {
    return {
      individualPrices: this.cache.size,
      allPricesCached: this.allPricesCache !== null,
      allPricesCount: this.allPricesCache ? Object.keys(this.allPricesCache.prices).length : 0,
    };
  }
}

// Export singleton instance
export const binancePriceService = BinancePriceService.getInstance();
