import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const MORPHO_API_URL = 'https://api.morpho.org/graphql';

// Chain IDs
const ARBITRUM_CHAIN_ID = 42161;
const POLYGON_CHAIN_ID = 137;

interface MorphoPosition {
  market: {
    uniqueKey: string;
    lltv: number;
    loanAsset: {
      address: string;
      symbol: string;
      decimals: number;
    };
    collateralAsset: {
      address: string;
      symbol: string;
      decimals: number;
    };
    state: {
      borrowApy: number;
      supplyApy: number;
      netBorrowApy: number | null;
      netSupplyApy: number | null;
      weeklyBorrowApy: number | null;
      weeklyNetBorrowApy: number | null;
    };
  };
  borrowAssets: string;
  borrowAssetsUsd: number;
  borrowShares: string;
  collateral: string;
  collateralUsd: number;
  supplyAssets: string;
  supplyAssetsUsd: number;
  supplyShares: string;
}

interface UserData {
  address: string;
  marketPositions: MorphoPosition[];
}

async function fetchMorphoData(walletAddress: string, chainId: number): Promise<UserData | null> {
  const query = `
    query GetUserPositions($address: String!, $chainId: Int!) {
      userByAddress(address: $address, chainId: $chainId) {
        address
        marketPositions {
          market {
            uniqueKey
            lltv
            loanAsset {
              address
              symbol
              decimals
            }
            collateralAsset {
              address
              symbol
              decimals
            }
            state {
              borrowApy
              supplyApy
              netBorrowApy
              netSupplyApy
              weeklyBorrowApy
              weeklyNetBorrowApy
            }
          }
          borrowAssets
          borrowAssetsUsd
          borrowShares
          collateral
          collateralUsd
          supplyAssets
          supplyAssetsUsd
          supplyShares
        }
      }
    }
  `;

  const response = await fetch(MORPHO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        address: walletAddress,
        chainId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Morpho API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.userByAddress;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.query.address as string;

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
      return;
    }

    // Fetch data from both chains in parallel
    const [arbitrumData, polygonData] = await Promise.all([
      fetchMorphoData(walletAddress, ARBITRUM_CHAIN_ID),
      fetchMorphoData(walletAddress, POLYGON_CHAIN_ID),
    ]);

    // Filter only positions with borrowed assets and add health factor
    const arbitrumBorrowPositions = (arbitrumData?.marketPositions?.filter(
      (pos: MorphoPosition) => parseFloat(pos.borrowAssets) > 0
    ) || []).map((pos: MorphoPosition) => {
      // Calculate health factor for Morpho
      // Health Factor = (Collateral USD × LLTV) / Borrow USD
      // LLTV is already in decimal form (e.g., 0.86 for 86%)
      const lltvDecimal = pos.market.lltv / 1e18;
      const healthFactor = pos.borrowAssetsUsd > 0
        ? (pos.collateralUsd * lltvDecimal) / pos.borrowAssetsUsd
        : null;

      return {
        ...pos,
        healthFactor,
        priceSource: 'morpho-api', // Morpho API provides USD values directly
      };
    });

    const polygonBorrowPositions = (polygonData?.marketPositions?.filter(
      (pos: MorphoPosition) => parseFloat(pos.borrowAssets) > 0
    ) || []).map((pos: MorphoPosition) => {
      // Calculate health factor for Morpho
      const lltvDecimal = pos.market.lltv / 1e18;
      const healthFactor = pos.borrowAssetsUsd > 0
        ? (pos.collateralUsd * lltvDecimal) / pos.borrowAssetsUsd
        : null;

      return {
        ...pos,
        healthFactor,
        priceSource: 'morpho-api', // Morpho API provides USD values directly
      };
    });

    res.json({
      success: true,
      data: {
        arbitrum: {
          chainId: ARBITRUM_CHAIN_ID,
          chainName: 'Arbitrum',
          positions: arbitrumBorrowPositions,
        },
        polygon: {
          chainId: POLYGON_CHAIN_ID,
          chainName: 'Polygon',
          positions: polygonBorrowPositions,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching Morpho positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
