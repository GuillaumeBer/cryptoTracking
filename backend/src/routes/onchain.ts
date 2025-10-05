import express, { Request, Response } from 'express';
import { onchainService } from '../services/onchain';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
    }

    console.log(`Fetching onchain balances for address: ${address}`);

    const balances = await onchainService.getAllOnchainBalances(address);

    res.json({
      success: true,
      data: {
        address,
        balances,
        chains: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base'],
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching onchain balances:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
