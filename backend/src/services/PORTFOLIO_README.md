# Portfolio Aggregator Service

Comprehensive multi-chain portfolio tracking service that aggregates token balances across 13 blockchains.

## Overview

The Portfolio Aggregator consolidates your crypto assets across:
- **8 EVM Chains**: Arbitrum, BSC, Base, Polygon, Avalanche, Ethereum, Optimism, Sonic
- **Solana**: Native SOL + all SPL tokens (with DexScreener pricing for meme coins)
- **4 Cosmos Chains**: Cosmos Hub, Osmosis, Celestia, Injective (includes staking)
- **Sui**: Native SUI + custom tokens (with reward token filtering)

## Files

### Service Layer
- `portfolio-aggregator.ts` - Core service for fetching and aggregating balances
- Located in: `backend/src/services/`

### API Routes
- `routes/portfolio.ts` - REST API endpoints for portfolio data
- Endpoints:
  - `GET /api/portfolio` - Full portfolio summary
  - `GET /api/portfolio/token/:symbol` - Check if you have a specific token
  - `GET /api/portfolio/balance/:symbol` - Get total balance across all chains

### Legacy (Deprecated)
- `test/fetch_arbitrum_assets.DEPRECATED.py` - Original Python implementation (replaced by TypeScript service)

## API Endpoints

### Get Complete Portfolio

```bash
GET http://localhost:3001/api/portfolio
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalValue": 7944.01,
    "chains": [
      {
        "chain": "arbitrum",
        "totalValue": 1953.62,
        "tokens": [
          {
            "name": "Pendle",
            "symbol": "PENDLE",
            "balance": 156.076345,
            "price": 4.68,
            "valueUsd": 730.97,
            "address": "0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8",
            "chain": "arbitrum"
          }
        ]
      }
    ],
    "timestamp": "2025-10-05T21:00:00.000Z"
  }
}
```

### Check Token Availability

```bash
GET http://localhost:3001/api/portfolio/token/SOL?minBalance=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasToken": true,
    "balance": 1.832791,
    "chain": "solana"
  }
}
```

### Get Token Balance Across All Chains

```bash
GET http://localhost:3001/api/portfolio/balance/ATOM
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalBalance": 83.876,
    "chains": [
      {
        "chain": "cosmos",
        "balance": 7.057
      },
      {
        "chain": "cosmos",
        "balance": 76.819
      }
    ]
  }
}
```

## Integration with Delta Neutral Strategy

The portfolio aggregator is integrated with the Hyperliquid delta neutral strategy to check spot balances across ALL chains (not just Binance and on-chain EVM).

### Usage in Hyperliquid Route

Located in: `backend/src/routes/hyperliquid.ts`

The service is ready to use but **commented out by default** to avoid performance overhead. To enable:

1. Uncomment the portfolio aggregator section (lines ~296-312):

```typescript
// OPTIONAL: Use Portfolio Aggregator for comprehensive cross-chain balance check
// Uncomment to include Solana, Cosmos (ATOM, OSMO, TIA, INJ), and Sui balances
/*
try {
  console.log(`🌐 Fetching portfolio from all chains (Solana, Cosmos, Sui)...`);
  const portfolio = await portfolioAggregator.getPortfolio();

  // Merge all token balances from portfolio
  portfolio.chains.forEach(chain => {
    chain.tokens.forEach(token => {
      spotBalances[token.symbol] = (spotBalances[token.symbol] || 0) + token.balance;
    });
  });

  console.log(`✅ Merged balances from ${portfolio.chains.length} additional chains`);
} catch (error) {
  console.error('Error fetching portfolio aggregator balances:', error);
}
*/
```

2. Remove the `/*` and `*/` to activate

This will include Solana, Cosmos, and Sui balances in the delta neutral calculation.

## Configuration

Set these environment variables in `.env`:

```bash
# Required
MORALIS_API_KEY=your_moralis_key

# EVM Wallet
WALLET_ADDRESS=0x...

# Solana
SOLANA_ADDRESS=...

# Sui
SUI_ADDRESS=0x...

# Cosmos Chains
COSMOS_ADDRESS=cosmos...
OSMOSIS_ADDRESS=osmo...
CELESTIA_ADDRESS=celestia...
INJECTIVE_ADDRESS=inj...
```

## Features

### Smart Price Discovery
- **Binance**: Primary source for major tokens (100 req/min)
- **CoinGecko**: Fallback for tokens not on Binance (10 req/min)
- **DexScreener**: Solana meme coins and low-cap tokens (30s cache)

### Token Filtering
- Minimum value threshold: $5 USD
- Automatic reward token filtering (Sui)
- Zero balance filtering
- Spam/unverified contract filtering (Moralis)

### Cosmos Staking Support
- Fetches both liquid and staked balances
- Aggregates delegations across all validators
- Separate entries for staked vs liquid tokens

### Performance
- Parallel API calls where possible
- Caching at multiple levels
- Rate limiting protection
- Timeout handling

## Example Use Cases

### 1. Check if user has SOL for gas
```typescript
const { hasToken, balance } = await portfolioAggregator.hasToken('SOL', 0.1);
if (!hasToken) {
  console.log('Insufficient SOL for gas fees');
}
```

### 2. Get total ATOM holdings (liquid + staked)
```typescript
const { totalBalance, chains } = await portfolioAggregator.getTokenBalance('ATOM');
console.log(`Total ATOM: ${totalBalance} across ${chains.length} locations`);
```

### 3. Delta Neutral Strategy Enhancement
```typescript
// Check if user has spot tokens to match short position
const shortSize = Math.abs(position.positionSize);
const { balance } = await portfolioAggregator.hasToken(position.coin);

if (balance < shortSize) {
  console.log(`Need to buy ${shortSize - balance} ${position.coin} for delta neutral`);
}
```

## Migration from Python Script

The original Python script (`test/fetch_arbitrum_assets.py`) has been migrated to TypeScript and enhanced with:

1. **API Integration** - RESTful endpoints instead of CLI
2. **Better Error Handling** - Graceful degradation per chain
3. **TypeScript Types** - Full type safety
4. **Modular Design** - Reusable service class
5. **Performance** - Async/parallel execution
6. **Extensibility** - Easy to add new chains

The old Python script is kept as `test/fetch_arbitrum_assets.DEPRECATED.py` for reference.

## Troubleshooting

### Common Issues

**Q: Portfolio returns empty chains array**
- Check that MORALIS_API_KEY is set
- Verify wallet addresses in .env
- Check backend logs for API errors

**Q: Missing tokens from specific chain**
- Verify chain-specific address is configured
- Check if token value is above $5 threshold
- Review filtering logic for that chain

**Q: Slow response times**
- Enable portfolio aggregator caching
- Reduce number of chains if not needed
- Check API rate limits (especially Moralis)

**Q: Delta neutral not including Solana/Cosmos**
- Uncomment portfolio aggregator in hyperliquid.ts
- This is disabled by default for performance

## Future Enhancements

- [ ] Add caching layer (Redis)
- [ ] WebSocket support for real-time updates
- [ ] Historical portfolio tracking
- [ ] NFT support
- [ ] Multi-wallet aggregation
- [ ] Export to CSV/PDF
