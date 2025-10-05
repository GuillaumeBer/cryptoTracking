import express, { Request, Response } from 'express';
import { bnbScanner } from '../services/bnb-scanner';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { address, minValue } = req.query;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
    }

    const minValueUsd = minValue ? parseFloat(minValue as string) : 10;

    console.log(`BNB Chain scan request for ${address} (min value: $${minValueUsd})`);

    const tokens = await bnbScanner.scanWallet(address, minValueUsd);

    res.json({
      success: true,
      data: {
        address,
        tokens,
        totalTokens: tokens.length,
        totalValue: tokens.reduce((sum, t) => sum + t.valueUsd, 0),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error scanning BNB Chain wallet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
