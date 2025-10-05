/**
 * Portfolio API Routes
 *
 * Provides endpoints for aggregated portfolio data across all chains
 */

import { Router, Request, Response } from 'express';
import { portfolioAggregator } from '../services/portfolio-aggregator';

const router = Router();

/**
 * GET /api/portfolio
 * Get complete portfolio summary across all chains
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const portfolio = await portfolioAggregator.getPortfolio();
    res.json({
      success: true,
      data: portfolio,
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio data',
    });
  }
});

/**
 * GET /api/portfolio/token/:symbol
 * Check if user has a specific token and get balance
 */
router.get('/token/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const minBalance = parseFloat(req.query.minBalance as string) || 0;

    const result = await portfolioAggregator.hasToken(symbol, minBalance);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error checking token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check token balance',
    });
  }
});

/**
 * GET /api/portfolio/balance/:symbol
 * Get total balance of a specific token across all chains
 */
router.get('/balance/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const result = await portfolioAggregator.getTokenBalance(symbol);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching token balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token balance',
    });
  }
});

export default router;
