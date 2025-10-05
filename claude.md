# Claude Project Context

This file provides context for AI assistants (like Claude) working on this project.

## Project Overview

**Name**: Crypto Portfolio Tracker
**Type**: Full-stack DeFi portfolio tracking application
**Purpose**: Monitor lending positions, derivatives, and cross-chain balances across multiple protocols
**Status**: Production-ready

## Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Testing**: Jest
- **Port**: 3001

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Port**: 3000

## Project Structure

```
crypto-tracking/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── routes/         # API route handlers (AAVE, Morpho, Jupiter, Hyperliquid)
│   │   ├── services/       # Business logic & external API integrations
│   │   ├── types/          # TypeScript type definitions
│   │   └── index.ts        # Server entry point
│   ├── .env               # Environment variables (NOT in git)
│   ├── .env.example       # Environment template
│   └── package.json
│
├── frontend/               # Next.js React app
│   ├── app/
│   │   ├── borrowing/     # Multi-protocol lending positions page
│   │   ├── hyperliquid/   # Derivatives & delta-neutral tracking page
│   │   ├── types/         # TypeScript interfaces (Aave, Morpho, Jupiter)
│   │   └── page.tsx       # Home page with navigation
│   ├── lib/
│   │   └── api-config.ts  # Centralized API endpoint configuration
│   └── package.json
│
└── docs/                  # Documentation
    ├── ARCHITECTURE.md    # System architecture
    ├── API.md            # API reference
    └── JUPITER_LEND_INTEGRATION.md
```

## Supported Protocols

### Lending & Borrowing
1. **AAVE V3** (5 chains)
   - Chains: Arbitrum, Base, Avalanche, BNB Chain, Sonic
   - Data Source: The Graph subgraphs
   - Auth: GRAPH_API_KEY required

2. **Morpho** (2 chains)
   - Chains: Arbitrum, Polygon
   - Data Source: Morpho public API
   - Features: Isolated markets with LLTV

3. **Jupiter Lend** (Solana)
   - SDK: @jup-ag/lend
   - Features: Supply positions (borrow pending SDK support)

### Derivatives
4. **Hyperliquid**
   - Features: Short positions, funding rates, delta-neutral detection
   - Data Source: Hyperliquid public API

## Environment Variables

### Backend (.env)
```env
PORT=3001
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
ALCHEMY_API_KEY=your_alchemy_api_key
GRAPH_API_KEY=your_graph_api_key
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Key API Endpoints

### Protocol Routes
- `GET /api/morpho?address={address}` - Morpho lending positions
- `GET /api/aave?address={address}` - AAVE V3 positions across 5 chains
- `GET /api/jupiter?address={address}` - Jupiter Lend (Solana)
- `GET /api/hyperliquid?address={address}` - Derivatives positions

### Utility Routes
- `GET /api/onchain?address={address}` - EVM chain balances (5 chains)
- `GET /api/bnb-scan?address={address}` - BNB Chain token scanner
- `GET /api/prices?symbols={symbols}` - Token prices (Binance → CoinGecko fallback)
- `GET /api/portfolio` - Aggregated portfolio view
- `GET /health` - Health check

## Important Code Patterns

### 1. API Configuration (Frontend)
```typescript
// Always use centralized config
import { endpoints } from '@/lib/api-config';

// ✅ Correct
fetch(endpoints.morpho(walletAddress))

// ❌ Wrong - never hardcode URLs
fetch(`http://localhost:3001/api/morpho?address=${walletAddress}`)
```

### 2. Price Service (Backend)
```typescript
import { priceService } from '../services/price-api';

// Get single price with automatic fallbacks
const { price, source } = await priceService.getTokenPrice('WETH');

// Batch request (more efficient)
const prices = await priceService.getTokenPrices(['WETH', 'USDC', 'WBTC']);
```

### 3. TypeScript Types
- Always use proper types, avoid `any`
- Protocol types: `frontend/app/types/[protocol].ts`
- Backend types: `backend/src/types/[type].ts`

### 4. Error Handling
All API responses follow this pattern:
```typescript
// Success
{
  success: true,
  data: { ... }
}

// Error
{
  success: false,
  error: "Error message"
}
```

## External API Integration

### Rate Limits & Caching
- **Price Service**: 5-minute cache, automatic fallback
- **Binance**: Managed by SDK, cached
- **The Graph**: API key required for production
- **Alchemy**: Free tier 300M compute units/month

### API Sources
1. **The Graph** - AAVE subgraphs (5 chains)
2. **Morpho API** - Public lending data
3. **Jupiter Lend SDK** - Solana lending
4. **Hyperliquid API** - Derivatives & funding
5. **Binance API** - Primary price source
6. **CoinGecko** - Fallback price source
7. **Alchemy SDK** - EVM onchain balances

## Development Workflow

### Starting Development
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Building for Production
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

### Running Tests
```bash
cd backend
npm test
```

## Common Tasks

### Adding a New Protocol

1. **Backend Route** (`backend/src/routes/[protocol].ts`)
   ```typescript
   import express from 'express';
   const router = express.Router();

   router.get('/', async (req, res) => {
     // Implementation
   });

   export default router;
   ```

2. **Register Route** (`backend/src/index.ts`)
   ```typescript
   import protocolRouter from './routes/protocol';
   app.use('/api/protocol', protocolRouter);
   ```

3. **Frontend Types** (`frontend/app/types/protocol.ts`)
   ```typescript
   export interface ProtocolResponse {
     success: boolean;
     data: ProtocolData;
   }
   ```

4. **API Config** (`frontend/lib/api-config.ts`)
   ```typescript
   export const endpoints = {
     protocol: (address: string) => `${API_BASE_URL}/api/protocol?address=${address}`,
   };
   ```

### Adding a New Chain to AAVE

1. Update `AAVE_SUBGRAPHS` in `backend/src/routes/aave.ts`
2. Update `CHAIN_IDS` mapping
3. Add subgraph URL with GRAPH_API_KEY
4. Update types if needed

### Adding New Token Prices

1. Update `BINANCE_SYMBOL_MAP` in `backend/src/services/price-api/index.ts`
2. Or update `COINGECKO_SYMBOL_MAP` for tokens not on Binance
3. Add fallback price in `FALLBACK_PRICES`

## Important Files to Know

### Configuration
- `backend/src/config/price-api.config.ts` - Price API configuration
- `frontend/lib/api-config.ts` - Frontend API endpoints
- `.gitignore` - Ensure .env files are excluded

### Core Services
- `backend/src/services/price-api/index.ts` - Unified price service
- `backend/src/services/portfolio-aggregator.ts` - Cross-chain aggregation
- `backend/src/services/binance.ts` - Binance integration

### Type Definitions
- `backend/src/types/hyperliquid.ts` - Hyperliquid API types
- `frontend/app/types/*.ts` - Protocol response types

## Security Considerations

### Never Commit
- `.env` files
- API keys in code
- User wallet addresses in state defaults
- Log files

### Always Use
- Environment variables for secrets
- `.env.example` for templates
- TypeScript for type safety
- Proper error handling

## Documentation

- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **API Reference**: [docs/API.md](docs/API.md)
- **Jupiter Integration**: [docs/JUPITER_LEND_INTEGRATION.md](docs/JUPITER_LEND_INTEGRATION.md)
- **Improvements Log**: [IMPROVEMENTS_SUMMARY.md](IMPROVEMENTS_SUMMARY.md)

## Debugging

### Backend Issues
```bash
# Check logs
cd backend && npm run dev

# Test specific endpoint
curl http://localhost:3001/api/health

# Check environment variables
cat backend/.env
```

### Frontend Issues
```bash
# Check build
cd frontend && npm run build

# Check types
npm run type-check
```

### Common Errors

1. **"GRAPH_API_KEY is not defined"**
   - Add to `backend/.env`

2. **"Cannot find module '@/lib/api-config'"**
   - Check `frontend/tsconfig.json` paths configuration

3. **TypeScript errors with 'any'**
   - Create proper types in `backend/src/types/` or `frontend/app/types/`

4. **CORS errors**
   - Backend has CORS enabled for all origins (development)
   - Configure for production deployment

## Data Flow

1. **User enters wallet address** → Frontend
2. **Frontend fetches** → `endpoints.protocol(address)`
3. **Backend receives** → Route handler validates
4. **Service layer** → Fetches from external API
5. **Price enrichment** → Price service adds USD values
6. **Response** → Formatted JSON back to frontend
7. **UI updates** → Display positions with health factors

## Performance Tips

1. **Price Service**: Already cached (5 min TTL)
2. **Batch Requests**: Use `getTokenPrices()` not multiple `getTokenPrice()`
3. **Frontend**: Consider React Query for caching
4. **Backend**: Existing batch optimization in place

## Git Workflow

### Before Committing
```bash
# Build both projects
cd backend && npm run build
cd ../frontend && npm run build

# Run tests
cd ../backend && npm test
```

### Commit Message Format
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
refactor: Refactor code
test: Add tests
```

## Recent Major Changes

**Latest Commit**: `d898e9e` (2025-10-05)
- Cleaned up unnecessary files
- Moved API keys to environment variables
- Created centralized API configuration
- Added comprehensive TypeScript types
- Complete documentation overhaul
- Production-ready codebase

## Future Enhancements

### Planned
- Jupiter Lend borrow positions (pending SDK support)
- Historical position tracking
- WebSocket real-time updates
- Multi-wallet support
- Price alerts

### Consider
- React Query for frontend caching
- Docker containerization
- CI/CD pipeline
- Error tracking (Sentry)
- Monitoring (Grafana)

## Testing Checklist

When making changes:
- [ ] TypeScript compiles without errors
- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] No hardcoded values added
- [ ] Environment variables used for secrets
- [ ] Types defined (no `any`)
- [ ] Documentation updated
- [ ] Tests pass (if applicable)

## Contact & Resources

- **Repository**: https://github.com/GuillaumeBer/cryptoTracking
- **Architecture Docs**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **API Docs**: [docs/API.md](docs/API.md)

---

**Last Updated**: 2025-10-05
**Status**: ✅ Production Ready
**AI Assistant**: This file is optimized for Claude and other AI assistants to understand the project context quickly
