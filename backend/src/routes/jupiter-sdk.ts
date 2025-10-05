import express, { Request, Response } from 'express';
// @ts-ignore - ESM module issue
import { Client } from '@jup-ag/lend/api';

const router = express.Router();

// Initialize Jupiter Lend API Client
const jupiterLendClient = new Client();

interface JupiterPosition {
  asset: string;
  assetName: string;
  type: 'supply' | 'borrow';
  amount: number;
  amountUsd: number;
  apy: number;
  shares?: string;
  decimals: number;
  priceUsd: number;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.query.address as string;
    console.log(`Jupiter SDK API called with address: ${walletAddress}`);

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
      return;
    }

    // Fetch Earn (supply) positions using official SDK
    console.log('Fetching Earn positions via SDK...');
    const earnPositions = await jupiterLendClient.earn.getPositions({
      users: [walletAddress],
    });

    console.log(`SDK returned ${earnPositions.length} earn positions`);

    // Process supply positions
    const supplyPositions: JupiterPosition[] = earnPositions
      .filter((pos: any) => parseFloat(pos.shares) > 0)
      .map((pos: any) => {
        const amount = parseFloat(pos.underlyingAssets) / Math.pow(10, pos.token.asset.decimals);
        const priceUsd = parseFloat(pos.token.asset.price);
        const amountUsd = amount * priceUsd;
        const apy = parseFloat(pos.token.totalRate) / 10000; // Convert basis points to percentage

        return {
          asset: pos.token.asset.symbol,
          assetName: pos.token.asset.name,
          type: 'supply' as const,
          amount,
          amountUsd,
          apy,
          shares: pos.shares,
          decimals: pos.token.asset.decimals,
          priceUsd,
        };
      });

    console.log(`Processed ${supplyPositions.length} active supply positions`);

    // TODO: Fetch borrow positions
    // The SDK currently only exposes Earn API for positions
    // Borrow positions would need to be queried on-chain
    const borrowPositions: JupiterPosition[] = [];

    const totalSupplied = supplyPositions.reduce((sum, pos) => sum + pos.amountUsd, 0);
    const totalBorrowed = borrowPositions.reduce((sum, pos) => sum + pos.amountUsd, 0);

    // Calculate health factor (if applicable)
    let healthFactor: number | null = null;
    if (totalBorrowed > 0 && totalSupplied > 0) {
      // Simplified health factor calculation
      // Real calculation would need liquidation thresholds from vault data
      healthFactor = totalSupplied / totalBorrowed;
    }

    res.json({
      success: true,
      data: {
        solana: {
          chainId: 101,
          chainName: 'Solana',
          protocol: 'Jupiter Lend',
          supplyPositions,
          borrowPositions,
          totalSupplied,
          totalBorrowed,
          healthFactor,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching Jupiter positions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Jupiter positions',
    });
  }
});

export default router;
