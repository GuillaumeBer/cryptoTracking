/**
 * Price API Configuration
 *
 * Centralized configuration for all price API services
 * Adjust these values based on your API tier and requirements
 */

export const priceApiConfig = {
  /**
   * CoinGecko API Configuration
   */
  coingecko: {
    // Rate limit settings
    rateLimit: {
      // Free tier: 10-30 calls/minute (we use conservative 10/min)
      // Pro tier: 500 calls/minute
      // Enterprise: Custom limits
      maxRequestsPerMinute: process.env.COINGECKO_MAX_REQUESTS_PER_MINUTE
        ? parseInt(process.env.COINGECKO_MAX_REQUESTS_PER_MINUTE)
        : 10,
    },

    // Cache settings
    cache: {
      // Cache TTL in milliseconds
      // 5 minutes is good for most use cases
      // Increase for less volatile data, decrease for real-time needs
      ttl: process.env.COINGECKO_CACHE_TTL
        ? parseInt(process.env.COINGECKO_CACHE_TTL)
        : 5 * 60 * 1000, // 5 minutes
    },

    // Batch request settings
    batch: {
      // Max addresses per batch request
      // CoinGecko supports ~100 but we use conservative value
      maxAddressesPerBatch: 50,
      maxIdsPerBatch: 100,
    },

    // Retry settings
    retry: {
      maxRetries: 3,
      // Exponential backoff: 2^attempt * baseDelay
      baseDelayMs: 1000,
    },
  },

  /**
   * Binance API Configuration
   */
  binance: {
    // Rate limit settings
    rateLimit: {
      // Binance uses weight-based rate limiting
      // 1200 weight per minute for general endpoints
      // Most price endpoints have weight 1-2
      // We use conservative 100 req/min = 1.67 req/sec
      maxRequestsPerMinute: process.env.BINANCE_MAX_REQUESTS_PER_MINUTE
        ? parseInt(process.env.BINANCE_MAX_REQUESTS_PER_MINUTE)
        : 100,
    },

    // Cache settings
    cache: {
      // Cache TTL in milliseconds
      // 1 minute is good for Binance as prices change frequently
      // Increase if you don't need real-time data
      ttl: process.env.BINANCE_CACHE_TTL
        ? parseInt(process.env.BINANCE_CACHE_TTL)
        : 60 * 1000, // 1 minute
    },

    // Retry settings
    retry: {
      maxRetries: 3,
      // Exponential backoff: 2^attempt * baseDelay
      baseDelayMs: 1000,
    },
  },
};

/**
 * Validate configuration on startup
 */
export function validatePriceApiConfig(): void {
  const errors: string[] = [];

  // Validate CoinGecko config
  if (priceApiConfig.coingecko.rateLimit.maxRequestsPerMinute < 1) {
    errors.push('CoinGecko maxRequestsPerMinute must be at least 1');
  }
  if (priceApiConfig.coingecko.cache.ttl < 0) {
    errors.push('CoinGecko cache TTL must be non-negative');
  }

  // Validate Binance config
  if (priceApiConfig.binance.rateLimit.maxRequestsPerMinute < 1) {
    errors.push('Binance maxRequestsPerMinute must be at least 1');
  }
  if (priceApiConfig.binance.cache.ttl < 0) {
    errors.push('Binance cache TTL must be non-negative');
  }

  if (errors.length > 0) {
    throw new Error(`Price API configuration errors:\n${errors.join('\n')}`);
  }

  console.log('✅ Price API configuration validated');
  console.log(`   CoinGecko: ${priceApiConfig.coingecko.rateLimit.maxRequestsPerMinute} req/min, ${priceApiConfig.coingecko.cache.ttl / 1000}s cache`);
  console.log(`   Binance: ${priceApiConfig.binance.rateLimit.maxRequestsPerMinute} req/min, ${priceApiConfig.binance.cache.ttl / 1000}s cache`);
}
