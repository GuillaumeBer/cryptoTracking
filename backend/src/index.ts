import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morphoRouter from './routes/morpho';
import aaveRouter from './routes/aave';
import jupiterRouter from './routes/jupiter-sdk';
import hyperliquidRouter from './routes/hyperliquid';
import onchainRouter from './routes/onchain';
import bnbScanRouter from './routes/bnb-scan';
import pricesRouter from './routes/prices';
import portfolioRouter from './routes/portfolio';
import perpConnectorsRouter from './routes/perp-connectors';
import { validatePriceApiConfig } from './config/price-api.config';
import { errorHandler } from './middleware/error-handler';

dotenv.config();

// Validate price API configuration on startup
try {
  validatePriceApiConfig();
} catch (error) {
  console.error('Failed to validate price API configuration:', error);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/morpho', morphoRouter);
app.use('/api/aave', aaveRouter);
app.use('/api/jupiter', jupiterRouter);
app.use('/api/hyperliquid', hyperliquidRouter);
app.use('/api/onchain', onchainRouter);
app.use('/api/bnb-scan', bnbScanRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/perp-connectors', perpConnectorsRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Centralized error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
