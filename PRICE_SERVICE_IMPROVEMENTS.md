# Price Service Improvements

## Issues Fixed

### 1. Wrapped Token Price Mapping Bug (WBNB)

**Problem:**
- WBNB was using fallback price ($620) instead of real-time Binance price (~$1,190)
- The batch price fetch had a bug where `binanceMap` was built but never used
- This caused significant inaccuracies in collateral values and health factors

**Root Cause:**
In `getTokenPrices()`, the code was calling `getTokenUsdPrices(['WBNB'])` which tried to find "WBNBUSDT" on Binance (doesn't exist). The correct mapping WBNB → BNBUSDT was in `binanceMap` but wasn't being used.

**Fix:**
Updated batch fetch to use the `binanceMap` to look up correct trading pairs:
```typescript
const allPrices = await binancePriceService.getAllPrices();
for (const symbol of binanceSymbols) {
  const binancePair = binanceMap[symbol];
  if (binancePair && allPrices[binancePair] !== undefined) {
    results[symbol] = { price: allPrices[binancePair], source: 'binance' };
  }
}
```

**Impact:**
- BNB Chain position health factor: 1.28 → 2.47 (92% increase!)
- Collateral value accuracy: $4,465 → $8,573 (accurate)

### 2. Automatic Unwrapping for Wrapped Tokens

**Problem:**
- Wrapped/staked tokens (wS, sAVAX, wSOL) were using CoinGecko unnecessarily
- The underlying tokens (S, AVAX, SOL) exist on Binance
- This increased CoinGecko API usage and added latency

**Solution:**
Added automatic unwrapping logic:
1. If token not in `BINANCE_SYMBOL_MAP`, try unwrapping (remove 'w' or 's' prefix)
2. Check if unwrapped version exists in Binance mapping
3. Use unwrapped token price from Binance
4. Fall back to CoinGecko only if needed

**Implementation:**
```typescript
function getUnwrappedSymbol(symbol: string): string | null {
  // Handle wrapped tokens: wS -> S, wSOL -> SOL
  if (symbol.startsWith('w') && symbol.length > 1) {
    return symbol.substring(1);
  }
  // Handle staked tokens: sAVAX -> AVAX
  if (symbol.startsWith('s') && symbol.length > 1) {
    return symbol.substring(1);
  }
  return null;
}
```

**Results:**
| Token | Old Source | New Source | Price |
|-------|------------|------------|-------|
| WBNB | fallback ($620) | binance ($1,190) | ✅ 92% more accurate |
| wS | coingecko | binance ($0.277) | ✅ Reduced API calls |
| sAVAX | coingecko | binance ($30.23) | ✅ Reduced API calls |
| wSOL | N/A | binance ($232.61) | ✅ New support |

## Current Price Service Hierarchy

1. **Direct Binance mapping** (fastest, most reliable)
   - Explicit mappings in `BINANCE_SYMBOL_MAP`
   - Examples: WETH → ETHUSDT, WBNB → BNBUSDT

2. **Automatic unwrapping → Binance** (new!)
   - Remove 'w' or 's' prefix and check Binance
   - Examples: wS → S → SUSDT, sAVAX → AVAX → AVAXUSDT

3. **Alternative Binance lookup**
   - Try common pairs: TOKENUSDT, TOKENBUSD, TOKENUSD, TOKENUSDC

4. **CoinGecko fallback**
   - For LST derivatives (weETH, wstETH) that need specific pricing
   - Custom token mappings in `COINGECKO_SYMBOL_MAP`

5. **Static fallback prices**
   - Updated periodically for emergency fallback

6. **Default ($1)**
   - Last resort for unknown tokens

## API Usage Optimization

**Before:**
- 8 collateral assets tracked
- 5 Binance API calls
- 3 CoinGecko API calls

**After:**
- 8 collateral assets tracked
- 6 Binance API calls (+1 via unwrapping)
- 2 CoinGecko API calls (-1)

**CoinGecko usage reduced by 33%**

## Testing

Run the test scripts:
```bash
# Test wrapped token unwrapping
node test-wrapped-tokens.mjs

# Test WBNB price fix
node test-wbnb-price.mjs
```

## Files Modified

1. `backend/src/services/price-api/index.ts`
   - Added `getUnwrappedSymbol()` helper function
   - Fixed batch price fetch to use `binanceMap`
   - Added unwrapping logic to single and batch fetch methods
   - Updated BINANCE_SYMBOL_MAP with wrapped token mappings

## Recommendations

1. **LST Derivatives**: Consider adding Binance futures prices for LSTs if available
2. **Monitoring**: Track price source distribution to optimize further
3. **Caching**: Consider longer TTL for stablecoin prices (they rarely change)

## Health Factor Impact

Sample position (BNB Chain):
- **Before**: HF = 1.28 (⚠️ Medium Risk)
- **After**: HF = 2.47 (✅ Safe)

The user's position was actually much safer than displayed - the bug made it appear riskier due to undervalued collateral.
