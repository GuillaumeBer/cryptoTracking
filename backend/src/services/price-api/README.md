# Centralized Price API System

## Overview

This system provides a **centralized, rate-limited, and cached** interface for fetching cryptocurrency prices from multiple sources (Binance and CoinGecko). It ensures we **never hit API rate limits** while maintaining fast response times.

## Key Features

### 🚦 Rate Limiting
- **Token Bucket Algorithm**: Prevents exceeding API limits
- **Configurable limits**: Adjust per API tier (free/pro/enterprise)
- **Automatic queuing**: Requests wait when limit is reached
- **Real-time monitoring**: Logs when rate limiting is active

### 💾 Smart Caching
- **In-memory cache**: Fast lookups without API calls
- **Configurable TTL**: Different cache durations per API
- **Automatic expiration**: Stale data is removed
- **Cache statistics**: Monitor cache hit rates

### 🔄 Intelligent Fallback
- **Binance first**: Lower rate limits, faster responses
- **CoinGecko fallback**: For tokens not on Binance
- **Static fallbacks**: Hardcoded prices when APIs fail
- **Source tracking**: Know where each price came from

### 🔁 Automatic Retry
- **Exponential backoff**: Smart retry delays
- **Rate limit detection**: Handles HTTP 429 responses
- **Configurable retries**: Set max attempts per request

### 📦 Batch Optimization
- **Single API call**: Fetch all Binance prices at once
- **Batch requests**: Group multiple CoinGecko lookups
- **Reduced API usage**: Minimize number of requests

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Price Service                            │
│  (Unified interface with smart orchestration)                │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
    ┌────────▼─────────┐        ┌────────▼──────────┐
    │ Binance Price    │        │ CoinGecko         │
    │ Service          │        │ Service           │
    │                  │        │                   │
    │ • Rate Limiter   │        │ • Rate Limiter    │
    │ • Cache (1 min)  │        │ • Cache (5 min)   │
    │ • All prices     │        │ • Token prices    │
    │   in one call    │        │ • Coin prices     │
    └──────────────────┘        └───────────────────┘
```

## Configuration

Configuration is centralized in [`config/price-api.config.ts`](../../config/price-api.config.ts).

### Environment Variables

You can override defaults via environment variables:

```bash
# CoinGecko settings
COINGECKO_MAX_REQUESTS_PER_MINUTE=10      # Free tier: 10, Pro: 500
COINGECKO_CACHE_TTL=300000                # Cache TTL in ms (5 min default)

# Binance settings
BINANCE_MAX_REQUESTS_PER_MINUTE=100       # Conservative limit
BINANCE_CACHE_TTL=60000                   # Cache TTL in ms (1 min default)
```

### Default Configuration

| Service    | Rate Limit       | Cache TTL | Batch Size |
|------------|------------------|-----------|------------|
| CoinGecko  | 10 req/min       | 5 minutes | 50 addresses, 100 IDs |
| Binance    | 100 req/min      | 1 minute  | All prices in one call |

## Usage

### Import the Service

```typescript
import { priceService } from './services/price-api';
```

### Get a Single Token Price

```typescript
// By symbol (tries Binance first, then CoinGecko)
const result = await priceService.getTokenPrice('ETH');
console.log(`ETH: $${result.price} (source: ${result.source})`);
// Output: ETH: $3300 (source: binance)
```

### Get Multiple Token Prices (Batched)

```typescript
const symbols = ['ETH', 'BTC', 'BNB', 'AAVE'];
const prices = await priceService.getTokenPrices(symbols);

for (const [symbol, result] of Object.entries(prices)) {
  console.log(`${symbol}: $${result.price} (${result.source})`);
}
```

### Get Price by Contract Address

```typescript
const result = await priceService.getTokenPriceByContract(
  'binance-smart-chain',
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' // CAKE
);
console.log(`Price: $${result.price} (source: ${result.source})`);
```

### Get Multiple Prices by Contract (Batched)

```typescript
const addresses = [
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
  '0x55d398326f99059fF775485246999027B3197955', // USDT
];

const prices = await priceService.getTokenPricesByContract(
  'binance-smart-chain',
  addresses
);
```

### Price Sources

Each price result includes a `source` field:

- **`binance`**: Price from Binance API (most common)
- **`coingecko`**: Price from CoinGecko API (for tokens not on Binance)
- **`fallback`**: Static fallback price (when APIs fail)
- **`default`**: Default $1 (for unknown tokens)

## How It Prevents Rate Limits

### 1. Token Bucket Rate Limiting

The system uses a **token bucket algorithm** to enforce rate limits:

```typescript
// Example: 10 requests/minute for CoinGecko
const rateLimiter = new RateLimiter(10); // 10 tokens/minute

// Each request consumes 1 token
await rateLimiter.acquire(); // Waits if no tokens available
```

When rate limit is reached:
```
⏳ CoinGecko rate limit: waiting 6s
```

### 2. Smart Caching

Responses are cached based on TTL:

```typescript
// First call: hits API
const price1 = await priceService.getTokenPrice('ETH');
// 💾 Binance API call: ETH = $3300

// Second call: uses cache
const price2 = await priceService.getTokenPrice('ETH');
// 💾 Binance cache hit: ETH = $3300
```

### 3. Batch Requests

Instead of making individual API calls:

```typescript
// ❌ BAD: Multiple API calls
for (const symbol of ['ETH', 'BTC', 'BNB']) {
  await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
}

// ✅ GOOD: Single batched call
const prices = await priceService.getTokenPrices(['ETH', 'BTC', 'BNB']);
```

### 4. Automatic Retry with Exponential Backoff

When rate limited by API:

```
Attempt 1: Immediate
Attempt 2: Wait 1s
Attempt 3: Wait 2s
Attempt 4: Wait 4s
```

## Monitoring and Debugging

### Cache Statistics

```typescript
const stats = priceService.getCacheStats();
console.log(stats);
// {
//   binance: {
//     individualPrices: 15,
//     allPricesCached: true,
//     allPricesCount: 2500
//   },
//   coingecko: {
//     size: 8,
//     keys: ['binance-smart-chain:0x...', 'coin:bitcoin', ...]
//   }
// }
```

### Clear Caches

```typescript
// Clear all caches (useful for testing or forcing refresh)
priceService.clearAllCaches();
```

### Logs

The system provides detailed logging:

```
✅ CoinGecko service initialized: 10 req/min, 300s cache
✅ Binance Price service initialized: 100 req/min, 60s cache
💾 Binance: using cached all-prices data (2500 pairs)
💾 CoinGecko cache hit: 0x0e09fa... = $2.5
🔄 CoinGecko API call: sonic-3 = $0.27
⏳ CoinGecko rate limit: waiting 6s
⚠️ CoinGecko request failed (attempt 1), retrying after 1s
❌ CoinGecko request failed after retries: Network timeout
```

## Migration Guide

### Before (Direct API Calls)

```typescript
// ❌ Old code: Direct API calls
const response = await fetch('https://api.binance.com/api/v3/ticker/price');
const data = await response.json();

const response2 = await fetch(
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
);
const data2 = await response2.json();
```

### After (Centralized Service)

```typescript
// ✅ New code: Centralized service
import { priceService } from './services/price-api';

const prices = await priceService.getTokenPrices(['BTC', 'ETH']);
// Automatically:
// - Checks cache first
// - Rate limits requests
// - Batches API calls
// - Retries on failure
// - Falls back to alternatives
```

## Best Practices

### 1. Use Batch Methods

```typescript
// ✅ Good: Batch request
const prices = await priceService.getTokenPrices(['ETH', 'BTC', 'BNB']);

// ❌ Bad: Individual requests
const eth = await priceService.getTokenPrice('ETH');
const btc = await priceService.getTokenPrice('BTC');
const bnb = await priceService.getTokenPrice('BNB');
```

### 2. Prefer Symbol Over Contract

```typescript
// ✅ Good: Symbol lookup (uses Binance, faster)
const price = await priceService.getTokenPrice('ETH');

// ❌ Less efficient: Contract lookup (uses CoinGecko)
const price = await priceService.getTokenPriceByContract(
  'ethereum',
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
);
```

### 3. Handle All Sources

```typescript
const result = await priceService.getTokenPrice('UNKNOWN_TOKEN');

if (result.source === 'default') {
  console.warn(`No price data for token, using default $${result.price}`);
}
```

## Rate Limit Tiers

### CoinGecko

| Tier       | Rate Limit       | Recommended Config |
|------------|------------------|--------------------|
| Free       | 10-30 calls/min  | `maxRequestsPerMinute: 10` |
| Pro        | 500 calls/min    | `maxRequestsPerMinute: 500` |
| Enterprise | Custom           | Contact CoinGecko  |

### Binance

| Endpoint      | Weight | Limit              |
|---------------|--------|--------------------|
| All prices    | 2      | 1200 weight/min    |
| Single price  | 1      | 1200 weight/min    |

Our conservative config: **100 requests/minute** (well under limit)

## Troubleshooting

### Rate Limit Warnings

If you see:
```
⏳ CoinGecko rate limit: waiting 6s
```

**Solutions:**
1. Increase cache TTL (reduce API calls)
2. Upgrade API tier
3. Use batched requests instead of individual calls

### Cache Misses

If cache hit rate is low:
```typescript
// Check cache stats
const stats = priceService.getCacheStats();
```

**Solutions:**
1. Increase cache TTL in config
2. Pre-warm cache by calling `getTokenPrices()` with all needed symbols

### API Failures

If you see:
```
❌ CoinGecko request failed after retries
```

**The system automatically:**
1. Falls back to cached data (even if stale)
2. Falls back to static prices
3. Falls back to $1 default

## Files

```
backend/src/
├── services/
│   └── price-api/
│       ├── index.ts              # Unified price service (main entry point)
│       ├── binance-prices.ts     # Binance price service
│       ├── coingecko.ts          # CoinGecko service
│       └── README.md             # This file
└── config/
    └── price-api.config.ts       # Configuration
```

## License

Part of the crypto-tracking project.
