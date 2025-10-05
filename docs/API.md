# API Documentation

## Base URL
```
http://localhost:3001/api
```

In production, set via `NEXT_PUBLIC_API_URL` environment variable.

---

## Endpoints

### 1. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "message": "Backend is running"
}
```

---

### 2. Morpho Positions
```http
GET /api/morpho?address={walletAddress}
```

**Parameters:**
- `address` (required): EVM wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "arbitrum": {
      "chainId": 42161,
      "chainName": "Arbitrum",
      "positions": [
        {
          "market": {
            "uniqueKey": "...",
            "lltv": 860000000000000000,
            "loanAsset": { "symbol": "USDC", "decimals": 6 },
            "collateralAsset": { "symbol": "WETH", "decimals": 18 },
            "state": { "borrowApy": 0.05, "supplyApy": 0.03 }
          },
          "borrowAssets": "1000000000",
          "borrowAssetsUsd": 1000,
          "collateral": "500000000000000000",
          "collateralUsd": 1500,
          "healthFactor": 1.29
        }
      ]
    },
    "polygon": { ... }
  }
}
```

---

### 3. AAVE Positions
```http
GET /api/aave?address={walletAddress}
```

**Parameters:**
- `address` (required): EVM wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "arbitrum": {
      "chainId": 42161,
      "chainName": "Arbitrum",
      "positions": [
        {
          "asset": "USDC",
          "assetName": "USD Coin",
          "borrowAmount": "1000000000",
          "borrowAmountFormatted": 1000,
          "borrowAmountUsd": 1000,
          "collateralAmountUsd": 1500,
          "collateralAssets": [
            {
              "symbol": "WETH",
              "amount": 0.5,
              "amountUsd": 1500,
              "priceSource": "binance"
            }
          ],
          "healthFactor": 1.5,
          "liquidationThreshold": 0.85
        }
      ]
    },
    "base": { ... },
    "avalanche": { ... },
    "bnb": { ... },
    "sonic": { ... }
  }
}
```

---

### 4. Jupiter Lend Positions
```http
GET /api/jupiter?address={solanaAddress}
```

**Parameters:**
- `address` (required): Solana wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "solana": {
      "chainId": 101,
      "chainName": "Solana",
      "protocol": "Jupiter Lend",
      "supplyPositions": [
        {
          "asset": "USDS",
          "assetName": "USDS",
          "type": "supply",
          "amount": 1000,
          "amountUsd": 999.76,
          "apy": 10.05,
          "shares": "1000000000",
          "decimals": 6,
          "priceUsd": 0.999763
        }
      ],
      "borrowPositions": [],
      "totalSupplied": 999.76,
      "totalBorrowed": 0,
      "healthFactor": null
    }
  }
}
```

---

### 5. Hyperliquid Positions
```http
GET /api/hyperliquid?address={walletAddress}
```

**Parameters:**
- `address` (required): Wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "positions": [
      {
        "coin": "BTC",
        "entryPrice": 95000,
        "markPrice": 94500,
        "liquidationPrice": 98000,
        "positionSize": -0.5,
        "positionValueUsd": 47250,
        "unrealizedPnl": 250,
        "unrealizedPnlPercent": 0.53,
        "margin": 4725,
        "leverage": 10,
        "distanceToLiquidation": 3.7,
        "distanceToLiquidationUsd": 1750,
        "fundingPnl": 125,
        "spotBalance": 0.48,
        "isDeltaNeutral": true,
        "deltaImbalance": -0.02
      }
    ],
    "totalFundingPnl": 125,
    "spotBalances": {
      "BTC": 0.48,
      "ETH": 2.5
    },
    "timestamp": "2025-10-05T..."
  }
}
```

---

### 6. Onchain Balances
```http
GET /api/onchain?address={walletAddress}
```

**Parameters:**
- `address` (required): EVM wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "balances": {
      "ETH": 1.5,
      "USDC": 1000,
      "WETH": 0.5
    },
    "chains": ["Ethereum", "Polygon", "Arbitrum", "Optimism", "Base"],
    "timestamp": "2025-10-05T..."
  }
}
```

---

### 7. BNB Chain Scanner
```http
GET /api/bnb-scan?address={walletAddress}&minValue={minUsd}
```

**Parameters:**
- `address` (required): Wallet address
- `minValue` (optional): Minimum USD value (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "symbol": "BNB",
        "balance": 10.5,
        "valueUsd": 6500,
        "contractAddress": "0x..."
      }
    ]
  }
}
```

---

### 8. Token Prices
```http
GET /api/prices?symbols={comma-separated-list}
```

**Parameters:**
- `symbols` (required): Comma-separated token symbols

**Response:**
```json
{
  "success": true,
  "data": {
    "ETH": {
      "price": 3300,
      "source": "binance"
    },
    "USDC": {
      "price": 1,
      "source": "fallback"
    }
  }
}
```

---

### 9. Portfolio Aggregator
```http
GET /api/portfolio
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chains": [
      {
        "name": "Solana",
        "tokens": [
          { "symbol": "SOL", "balance": 10, "valueUsd": 1900 }
        ]
      }
    ],
    "totalValueUsd": 1900
  }
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common Error Codes:**
- `400` - Bad Request (missing parameters)
- `500` - Internal Server Error

---

## Rate Limiting

### Price Service
- **Cache TTL**: 5 minutes
- **Binance Fallback**: Automatic switch to CoinGecko
- **Batch Requests**: Supported for multiple symbols

### External APIs
- **Binance**: Rate limits managed by SDK
- **The Graph**: API key required for higher limits
- **Alchemy**: Free tier limits apply

---

## Authentication

Most endpoints don't require authentication from the client. However, the backend requires API keys for:

- `GRAPH_API_KEY` - The Graph subgraph access
- `BINANCE_API_KEY` + `BINANCE_API_SECRET` - Binance API
- `ALCHEMY_API_KEY` - Alchemy RPC access

Set these in backend `.env` file.

---

## CORS

CORS is enabled for all origins in development. Configure appropriately for production.

---

## WebSocket Support

Not currently implemented. Planned for future releases.
