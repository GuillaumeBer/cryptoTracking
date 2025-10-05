# Crypto Portfolio Tracker

A comprehensive DeFi portfolio tracking application that monitors lending positions, derivatives, and cross-chain balances across multiple protocols.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## Features

### 📊 Multi-Protocol Support
- **AAVE V3**: Track borrowing positions across Arbitrum, Base, Avalanche, BNB Chain, and Sonic
- **Morpho**: Monitor isolated lending markets on Arbitrum and Polygon
- **Jupiter Lend**: View Solana lending positions (supply side)
- **Hyperliquid**: Track short positions with delta-neutral detection

### 🔗 Multi-Chain Balances
- EVM chains: Ethereum, Polygon, Arbitrum, Optimism, Base
- Solana (via Jupiter)
- BNB Chain token scanner
- Aggregated portfolio view

### 💰 Smart Price Fetching
- Unified price service with automatic fallbacks
- Binance → CoinGecko → Static prices
- 5-minute caching for optimal performance
- Batch request optimization

### 🎯 Advanced Features
- **Health Factor Tracking**: Real-time liquidation risk monitoring
- **Delta Neutral Detection**: Automatic spot/short matching for Hyperliquid
- **Auto Refresh**: 30-60 second intervals for live data
- **Search & Filter**: Filter by protocol, chain, or asset
- **Risk Indicators**: Color-coded warnings for critical positions

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- API keys (see Environment Variables)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd crypto-tracking
```

2. **Install backend dependencies**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
```

3. **Install frontend dependencies**
```bash
cd ../frontend
npm install
cp .env.local.example .env.local
# Edit .env.local if needed
```

### Environment Variables

#### Backend (`backend/.env`)
```env
PORT=3001
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
ALCHEMY_API_KEY=your_alchemy_api_key
GRAPH_API_KEY=your_graph_api_key
```

#### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Running the Application

**Development Mode:**

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Production Mode:**

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

Access the application at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Project Structure

```
crypto-tracking/
├── backend/              # Express.js API server
│   ├── src/
│   │   ├── config/      # Configuration files
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── types/       # TypeScript types
│   │   └── index.ts     # Entry point
│   └── package.json
│
├── frontend/            # Next.js React app
│   ├── app/
│   │   ├── borrowing/   # Lending positions page
│   │   ├── hyperliquid/ # Derivatives page
│   │   ├── types/       # Type definitions
│   │   └── page.tsx     # Home page
│   ├── lib/
│   │   └── api-config.ts # API configuration
│   └── package.json
│
└── docs/               # Documentation
    ├── ARCHITECTURE.md # System architecture
    ├── API.md          # API documentation
    └── JUPITER_LEND_INTEGRATION.md
```

## API Documentation

See [docs/API.md](docs/API.md) for complete API reference.

### Main Endpoints

- `GET /api/morpho?address={address}` - Morpho positions
- `GET /api/aave?address={address}` - AAVE positions
- `GET /api/jupiter?address={address}` - Jupiter Lend positions
- `GET /api/hyperliquid?address={address}` - Hyperliquid positions
- `GET /api/prices?symbols={symbols}` - Token prices

## Architecture

The application follows a client-server architecture:

- **Backend**: Express.js REST API that aggregates data from multiple DeFi protocols
- **Frontend**: Next.js app with server-side rendering and client-side state management
- **Services**: Modular services for each protocol integration
- **Price Service**: Unified price fetching with intelligent fallbacks

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Supported Protocols

| Protocol | Chains | Features |
|----------|--------|----------|
| AAVE V3 | Arbitrum, Base, Avalanche, BNB, Sonic | Borrowing positions, health factor |
| Morpho | Arbitrum, Polygon | Isolated markets, LLTV |
| Jupiter Lend | Solana | Supply positions (borrow pending) |
| Hyperliquid | Hyperliquid L1 | Short positions, funding rates |

## Development

### Running Tests
```bash
cd backend
npm test
```

### Building for Production
```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

### Linting
```bash
# Backend
cd backend
npm run lint

# Frontend
cd frontend
npm run lint
```

## Troubleshooting

### Common Issues

**API Key Errors**
- Ensure all required API keys are set in `.env`
- Verify keys are valid and have appropriate permissions

**Price Fetching Issues**
- Check Binance API rate limits
- Verify CoinGecko is accessible
- Review price service cache stats

**Connection Errors**
- Ensure backend is running on port 3001
- Check CORS settings for production
- Verify network connectivity to external APIs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Security

- Never commit `.env` files
- Keep API keys secure
- Use environment variables for sensitive data
- Review `.gitignore` before committing

## License

[Add your license here]

## Acknowledgments

- [AAVE](https://aave.com/)
- [Morpho](https://morpho.org/)
- [Jupiter](https://jup.ag/)
- [Hyperliquid](https://hyperliquid.xyz/)
- [The Graph](https://thegraph.com/)
- [Alchemy](https://www.alchemy.com/)

## Support

For issues and questions:
- Open an issue on GitHub
- Check [docs/](docs/) for documentation
- Review API documentation in [docs/API.md](docs/API.md)

---

**Built with ❤️ using Next.js, Express, and TypeScript**
