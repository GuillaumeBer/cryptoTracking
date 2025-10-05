/**
 * DexScreener Price Service
 *
 * Free API for DEX token prices (no auth required)
 * Best for: Solana meme coins and low-cap tokens not on CoinGecko
 *
 * Rate Limits: ~300 requests/minute (undocumented, be conservative)
 * Cache: 30 seconds (prices change fast on DEXes)
 */

import axios from 'axios';

const BASE_URL = 'https://api.dexscreener.com/latest/dex';
const CACHE_TTL = 30 * 1000; // 30 seconds
const MAX_TOKENS_PER_REQUEST = 30; // DexScreener limit

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
  };
  priceUsd: string;
  liquidity: {
    usd: number;
  };
  volume: {
    h24: number;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

interface CacheEntry {
  price: number;
  timestamp: number;
}

class DexScreenerPriceService {
  private cache: Map<string, CacheEntry> = new Map();
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 200; // 200ms between requests = 5 req/sec max

  constructor() {
    console.log('✅ DexScreener Price service initialized: 30s cache');
  }

  /**
   * Get price for a single token by contract address
   */
  async getTokenPrice(contractAddress: string): Promise<number | null> {
    const cached = this.getFromCache(contractAddress);
    if (cached !== null) {
      return cached;
    }

    await this.rateLimit();

    try {
      const response = await axios.get<DexScreenerResponse>(
        `${BASE_URL}/tokens/${contractAddress}`,
        { timeout: 10000 }
      );

      if (response.data.pairs && response.data.pairs.length > 0) {
        // Sort by liquidity (most liquid pair first)
        const sortedPairs = response.data.pairs.sort(
          (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        );
        const price = parseFloat(sortedPairs[0].priceUsd);
        this.setCache(contractAddress, price);
        return price;
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `DexScreener API error for ${contractAddress}: ${error.response?.status} - ${error.message}`
        );
      } else {
        console.error(`DexScreener error for ${contractAddress}:`, error);
      }
      return null;
    }
  }

  /**
   * Get prices for multiple tokens (batched)
   * DexScreener supports up to 30 addresses per request
   */
  async getTokenPrices(contractAddresses: string[]): Promise<{ [address: string]: number }> {
    const results: { [address: string]: number } = {};
    const uncachedAddresses: string[] = [];

    // Check cache first
    for (const address of contractAddresses) {
      const cached = this.getFromCache(address);
      if (cached !== null) {
        results[address.toLowerCase()] = cached;
      } else {
        uncachedAddresses.push(address);
      }
    }

    if (uncachedAddresses.length === 0) {
      return results;
    }

    // Batch requests (max 30 per request)
    const batches: string[][] = [];
    for (let i = 0; i < uncachedAddresses.length; i += MAX_TOKENS_PER_REQUEST) {
      batches.push(uncachedAddresses.slice(i, i + MAX_TOKENS_PER_REQUEST));
    }

    for (const batch of batches) {
      await this.rateLimit();

      try {
        const addresses = batch.join(',');
        const response = await axios.get<DexScreenerResponse>(
          `${BASE_URL}/tokens/${addresses}`,
          { timeout: 15000 }
        );

        if (response.data.pairs && response.data.pairs.length > 0) {
          // Group pairs by base token address
          const pairsByToken: { [address: string]: DexScreenerPair[] } = {};
          for (const pair of response.data.pairs) {
            const addr = pair.baseToken.address.toLowerCase();
            if (!pairsByToken[addr]) {
              pairsByToken[addr] = [];
            }
            pairsByToken[addr].push(pair);
          }

          // Get best price for each token (highest liquidity pair)
          for (const [address, pairs] of Object.entries(pairsByToken)) {
            const sortedPairs = pairs.sort(
              (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
            );
            const price = parseFloat(sortedPairs[0].priceUsd);
            results[address] = price;
            this.setCache(address, price);
          }
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            `DexScreener batch API error: ${error.response?.status} - ${error.message}`
          );
        } else {
          console.error('DexScreener batch error:', error);
        }
      }
    }

    return results;
  }

  /**
   * Rate limiting - ensure minimum interval between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Get price from cache if not expired
   */
  private getFromCache(address: string): number | null {
    const entry = this.cache.get(address.toLowerCase());
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.price;
    }
    return null;
  }

  /**
   * Store price in cache
   */
  private setCache(address: string, price: number): void {
    this.cache.set(address.toLowerCase(), {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ DexScreener cache cleared');
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

// Singleton instance
export const dexScreenerService = new DexScreenerPriceService();
