# Crypto Tracker - Frontend

Next.js frontend application for the Crypto Portfolio Tracker.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI**: Custom components with dark mode support

## Getting Started

### Prerequisites
- Node.js 18+
- Backend server running on port 3001

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
app/
├── borrowing/          # Lending positions page
│   └── page.tsx
├── hyperliquid/        # Derivatives positions page
│   └── page.tsx
├── types/              # TypeScript type definitions
│   ├── aave.ts
│   ├── morpho.ts
│   └── jupiter.ts
├── layout.tsx          # Root layout with metadata
├── page.tsx            # Home page
└── globals.css         # Global styles

lib/
└── api-config.ts       # API endpoint configuration
```

## Pages

### Home (`/`)
Landing page with navigation to:
- Borrowing Positions
- Hyperliquid Shorts

### Borrowing Positions (`/borrowing`)
Multi-protocol lending dashboard:
- AAVE V3 positions (5 chains)
- Morpho positions (2 chains)
- Jupiter Lend (Solana)
- Filtering and sorting
- Health factor tracking

### Hyperliquid Shorts (`/hyperliquid`)
Derivatives trading dashboard:
- Short position tracking
- Delta-neutral detection
- Funding rate PnL
- Liquidation risk monitoring

## Features

### Auto-Refresh
- Borrowing page: 60 seconds
- Hyperliquid page: 30 seconds

### Filtering & Sorting
- Filter by protocol (AAVE, Morpho, Jupiter)
- Filter by chain
- Search by asset
- Sort by health factor, risk, borrowed amount

### Risk Indicators
- Color-coded health factors
- Visual liquidation risk bars
- Critical position warnings

### Dark Mode
Automatic dark mode support using Tailwind CSS dark mode utilities.

## API Integration

All API calls use the centralized configuration from `lib/api-config.ts`:

```typescript
import { endpoints } from '@/lib/api-config';

// Usage
fetch(endpoints.morpho(walletAddress))
fetch(endpoints.aave(walletAddress))
```

## Type Definitions

Type definitions are organized by protocol:
- `types/aave.ts` - AAVE position types
- `types/morpho.ts` - Morpho position types
- `types/jupiter.ts` - Jupiter Lend types

## Styling

This project uses Tailwind CSS v4 with:
- Custom color scheme
- Gradient backgrounds
- Responsive design
- Dark mode support

## Development Notes

### Adding a New Protocol
1. Create types in `app/types/[protocol].ts`
2. Add endpoint in `lib/api-config.ts`
3. Create UI components
4. Implement data fetching logic

### State Management
Currently using React hooks (useState, useEffect). Consider:
- Zustand for global state
- React Query for server state
- Context API for shared state

## Deployment

### Vercel (Recommended)
```bash
vercel
```

### Other Platforms
Build and deploy the `.next` folder:
```bash
npm run build
```

## Environment Variables

Required for production:
- `NEXT_PUBLIC_API_URL` - Backend API URL

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs)
