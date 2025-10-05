import { Router, Request, Response } from 'express';
import { priceService } from '../services/price-api';

const router = Router();

// Get a single token price by symbol
router.get('/token/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const result = await priceService.getTokenPrice(symbol);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch token price' });
  }
});

// Get multiple token prices by symbols
router.post('/tokens', async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols must be an array' });
    }
    const prices = await priceService.getTokenPrices(symbols);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch token prices' });
  }
});

// Get a single token price by contract address
router.get('/contract/:platform/:address', async (req: Request, res: Response) => {
  try {
    const { platform, address } = req.params;
    const result = await priceService.getTokenPriceByContract(platform, address);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch token price by contract' });
  }
});

// Get multiple token prices by contract addresses
router.post('/contracts/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { addresses } = req.body;
    if (!Array.isArray(addresses)) {
      return res.status(400).json({ error: 'Addresses must be an array' });
    }
    const prices = await priceService.getTokenPricesByContract(platform, addresses);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch token prices by contract' });
  }
});

export default router;
