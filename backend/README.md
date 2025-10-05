# Crypto Tracker - Backend

Express.js REST API for aggregating DeFi positions across multiple protocols and chains.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Testing**: Jest
- **External APIs**: Binance, Alchemy, The Graph, Morpho, Jupiter, Hyperliquid

## Getting Started

### Prerequisites
- Node.js 18+
- API keys for external services

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=3001
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
ALCHEMY_API_KEY=your_alchemy_api_key
GRAPH_API_KEY=your_graph_api_key
```

### Development

```bash
npm run dev
```

Server runs on http://localhost:3001

### Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── config/              # Configuration files
│   └── price-api.config.ts
├── routes/              # API route handlers
│   ├── aave.ts
│   ├── morpho.ts
│   ├── jupiter-sdk.ts
│   ├── hyperliquid.ts
│   ├── onchain.ts
│   ├── bnb-scan.ts
│   ├── prices.ts
│   └── portfolio.ts
├── services/            # Business logic & integrations
│   ├── binance.ts
│   ├── onchain.ts
│   ├── bnb-scanner.ts
│   ├── additional-chains.ts
│   ├── portfolio-aggregator.ts
│   └── price-api/
│       ├── index.ts
│       ├── binance-prices.ts
│       ├── coingecko.ts
│       └── dexscreener.ts
├── types/               # TypeScript type definitions
│   └── hyperliquid.ts
└── index.ts             # Server entry point
```

## API Routes

### Protocol Routes
- `GET /api/morpho` - Morpho lending positions
- `GET /api/aave` - AAVE V3 positions
- `GET /api/jupiter` - Jupiter Lend positions (Solana)
- `GET /api/hyperliquid` - Hyperliquid derivatives

### Utility Routes
- `GET /api/onchain` - EVM chain balances
- `GET /api/bnb-scan` - BNB Chain token scanner
- `GET /api/prices` - Token price data
- `GET /api/portfolio` - Aggregated portfolio view
- `GET /health` - Health check

See [../docs/API.md](../docs/API.md) for detailed API documentation.

## Available Scripts

- `npm run dev` - Start development server with hot-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Type checking

## External API Integration

### The Graph
AAVE V3 subgraph queries for 5 chains (API key required)

### Morpho API
Public API for Morpho positions

### Jupiter Lend SDK
Official SDK for Solana lending (`@jup-ag/lend`)

### Hyperliquid API
Public API for derivatives and funding rates

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for detailed architecture.