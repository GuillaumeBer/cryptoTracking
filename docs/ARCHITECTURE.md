# Architecture Documentation

## Overview

Crypto Tracking is a full-stack application for monitoring DeFi positions and trading activities across multiple protocols and chains.

## Tech Stack

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **APIs**: REST endpoints
- **External Services**:
  - Binance API (price data, spot balances)
  - Alchemy SDK (onchain data for EVM chains)
  - The Graph (AAVE subgraphs)
  - Morpho API (Morpho positions)
  - Jupiter Lend SDK (Solana lending)
  - Hyperliquid API (derivatives positions)

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: React Hooks (useState, useEffect)

## Project Structure

```
crypto-tracking/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic & external API integrations
│   │   ├── types/           # TypeScript type definitions
│   │   └── index.ts         # Server entry point
│   ├── .env                 # Environment variables (not committed)
│   ├── .env.example         # Environment template
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── borrowing/       # Borrowing positions page
│   │   ├── hyperliquid/     # Hyperliquid shorts page
│   │   ├── types/           # TypeScript interfaces
│   │   ├── layout.tsx       # Root layout
│   │   └── page.tsx         # Home page
│   ├── lib/
│   │   └── api-config.ts    # API endpoint configuration
│   └── package.json
│
└── docs/                    # Documentation
```

## Backend Architecture

### Routes Layer
Handles HTTP requests and responses. Each route file corresponds to a specific protocol:
- `aave.ts` - AAVE V3 positions
- `morpho.ts` - Morpho lending positions
- `jupiter-sdk.ts` - Jupiter Lend (Solana)
- `hyperliquid.ts` - Hyperliquid derivatives
- `onchain.ts` - EVM chain balances
- `bnb-scan.ts` - BNB Chain token scanner
- `prices.ts` - Token price data
- `portfolio.ts` - Aggregated portfolio view

### Services Layer
Business logic and external API integration:
- **Price Service**: Unified price fetching with fallbacks (Binance → CoinGecko → static)
- **Binance Service**: Spot balances and price data
- **Onchain Service**: Multi-chain EVM balance fetching (Alchemy)
- **Portfolio Aggregator**: Cross-chain portfolio aggregation
- **BNB Scanner**: BNB Chain ERC20 token discovery

### Data Flow
1. Frontend makes request to backend API endpoint
2. Route handler validates request
3. Service layer fetches data from external APIs
4. Price service enriches data with USD values
5. Response formatted and returned to frontend

## Frontend Architecture

### Pages
- **Home** (`page.tsx`): Landing page with navigation cards
- **Borrowing** (`borrowing/page.tsx`): Multi-protocol lending positions
- **Hyperliquid** (`hyperliquid/page.tsx`): Short positions and delta-neutral tracking

### Features
- Auto-refresh (30-60s intervals)
- Multi-chain support
- Real-time health factor calculation
- Risk level indicators
- Delta-neutral position detection
- Search and filtering

### API Integration
All API calls use centralized configuration from `lib/api-config.ts` with environment variable support.

## External APIs & Services

### The Graph (AAVE)
- **Purpose**: Query AAVE V3 positions
- **Chains**: Arbitrum, Base, Avalanche, BNB, Sonic
- **Auth**: API key required

### Morpho API
- **Purpose**: Fetch Morpho lending positions
- **Chains**: Arbitrum, Polygon
- **Auth**: Public API

### Jupiter Lend SDK
- **Purpose**: Solana lending positions
- **Package**: `@jup-ag/lend`
- **Features**: Earn positions (borrow support pending)

### Hyperliquid API
- **Purpose**: Derivatives positions, funding rates
- **Auth**: Public API
- **Features**: Position data, spot balances, funding history

### Binance API
- **Purpose**: Price data, spot balances
- **Auth**: API key + secret
- **Rate Limits**: Handled with caching

### Alchemy SDK
- **Purpose**: EVM onchain balances
- **Chains**: Ethereum, Polygon, Arbitrum, Optimism, Base
- **Auth**: API key

## Data Models

### Position Types
- **AAVE**: Borrow + collateral positions per chain
- **Morpho**: Isolated lending markets with LLTV
- **Jupiter**: Supply positions (Solana)
- **Hyperliquid**: Short positions with funding

### Health Factor Calculation
- **AAVE/Morpho**: `(Collateral × Liquidation Threshold) / Debt`
- **Hyperliquid**: Distance to liquidation price

## Security

### API Keys
- Stored in `.env` files (not committed)
- Example files provided (`.env.example`)
- Keys validated on startup

### Rate Limiting
- Price caching (5min TTL)
- Binance: Smart fallback to CoinGecko
- Request batching where possible

## Deployment

### Backend
```bash
cd backend
npm install
npm run build
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run build
npm start
```

### Environment Variables
See `.env.example` files in each directory.

## Future Enhancements

1. **Jupiter Borrow Positions**: Awaiting SDK support
2. **More Chains**: Solana, Cosmos, Sui via portfolio aggregator
3. **WebSocket**: Real-time updates
4. **Historical Data**: Position tracking over time
5. **Alerts**: Liquidation warnings
6. **Multi-wallet**: Support multiple addresses
