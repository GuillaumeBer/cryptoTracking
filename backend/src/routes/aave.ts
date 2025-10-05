import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import { priceService } from '../services/price-api';

const router = express.Router();

// AAVE V3 Subgraph endpoints
const GRAPH_API_KEY = process.env.GRAPH_API_KEY || '';

const AAVE_SUBGRAPHS = {
  arbitrum: `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B`,
  base: `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF`,
  avalanche: `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/2h9woxy8RTjHu1HJsCEnmzpPHFArU33avmUh4f71JpVn`,
  bnb: `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/7Jk85XgkV1MQ7u56hD8rr65rfASbayJXopugWkUoBMnZ`,
  sonic: `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/FQcacc4ZJaQVS9euWb76nvpSq2GxavBnUM6DU6tmspbi`,
};

// Chain IDs
const CHAIN_IDS = {
  arbitrum: 42161,
  base: 8453,
  avalanche: 43114,
  bnb: 56,
  sonic: 146, // Sonic mainnet chain ID
};

interface AaveReserve {
  symbol: string;
  decimals: number;
  name: string;
  reserveLiquidationThreshold: string;
  baseLTVasCollateral: string;
  variableBorrowRate: string;
}

interface AaveUserReserve {
  reserve: AaveReserve;
  currentVariableDebt: string;
  currentStableDebt: string;
  currentTotalDebt: string;
  principalStableDebt: string;
  scaledVariableDebt: string;
  stableBorrowRate: string;
  liquidityRate: string;
  usageAsCollateralEnabledOnUser: boolean;
  currentATokenBalance: string;
}

interface AaveUser {
  id: string;
  reserves: AaveUserReserve[];
}

async function fetchAaveData(walletAddress: string, subgraphUrl: string): Promise<AaveUser | null> {
  const query = `
    query GetUserReserves($userAddress: String!) {
      userReserves(where: { user: $userAddress }) {
        currentVariableDebt
        currentStableDebt
        currentTotalDebt
        principalStableDebt
        scaledVariableDebt
        stableBorrowRate
        liquidityRate
        usageAsCollateralEnabledOnUser
        currentATokenBalance
        reserve {
          symbol
          name
          decimals
          reserveLiquidationThreshold
          baseLTVasCollateral
          variableBorrowRate
        }
      }
    }
  `;

  try {
    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          userAddress: walletAddress.toLowerCase(),
        },
      }),
    });

    if (!response.ok) {
      console.error(`AAVE Subgraph error: ${response.statusText}`);
      return null;
    }

    const data: any = await response.json();

    if (data.errors) {
      console.error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      return null;
    }

    // Transform to match expected structure
    if (data.data.userReserves) {
      return {
        id: walletAddress,
        reserves: data.data.userReserves
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching AAVE data:', error);
    return null;
  }
}

// Note: Price fetching is now handled by the centralized price service
// All caching, rate limiting, and API orchestration is managed centrally

// Helper function to calculate USD value
async function calculateUSDValue(amount: string, decimals: number, symbol: string): Promise<number> {
  const normalizedAmount = parseFloat(amount) / Math.pow(10, decimals);
  const priceData = await priceService.getTokenPrice(symbol);
  return normalizedAmount * priceData.price;
}

// Helper function to process positions
async function processPositions(userData: AaveUser | null) {
  if (!userData?.reserves) return [];

  // Separate borrowed positions and collateral positions
  const borrowedReserves = userData.reserves.filter(r => parseFloat(r.currentTotalDebt) > 0);
  const collateralReserves = userData.reserves.filter(r =>
    parseFloat(r.currentATokenBalance) > 0 && r.usageAsCollateralEnabledOnUser
  );

  // Collect all unique symbols to batch fetch prices
  const allSymbols = new Set<string>();
  collateralReserves.forEach(r => allSymbols.add(r.reserve.symbol));
  borrowedReserves.forEach(r => allSymbols.add(r.reserve.symbol));

  // Batch fetch all prices at once using centralized price service
  const prices = await priceService.getTokenPrices(Array.from(allSymbols));

  // Calculate collateral assets with pre-fetched prices and liquidation thresholds
  const collateralAssets = collateralReserves.map(reserve => {
    const amount = parseFloat(reserve.currentATokenBalance) / Math.pow(10, reserve.reserve.decimals);
    const priceResult = prices[reserve.reserve.symbol] || { price: 1, source: 'default' };
    const amountUsd = amount * priceResult.price;
    const liquidationThreshold = parseFloat(reserve.reserve.reserveLiquidationThreshold) / 10000;
    return {
      symbol: reserve.reserve.symbol,
      name: reserve.reserve.name,
      amount: amount,
      amountUsd: amountUsd,
      priceSource: priceResult.source,
      liquidationThreshold: liquidationThreshold,
      weightedLiquidationThreshold: amountUsd * liquidationThreshold,
    };
  });

  const totalCollateralUsd = collateralAssets.reduce((total, asset) => total + asset.amountUsd, 0);

  // Calculate weighted average liquidation threshold based on collateral
  const totalWeightedLiquidationThreshold = collateralAssets.reduce(
    (total, asset) => total + asset.weightedLiquidationThreshold,
    0
  );
  const weightedAvgLiquidationThreshold = totalCollateralUsd > 0
    ? totalWeightedLiquidationThreshold / totalCollateralUsd
    : 0;

  // Map borrowed positions with pre-fetched prices
  return borrowedReserves.map(reserve => {
    const borrowAmountFormatted = parseFloat(reserve.currentTotalDebt) / Math.pow(10, reserve.reserve.decimals);
    const priceResult = prices[reserve.reserve.symbol] || { price: 1, source: 'default' };
    const borrowAmountUsd = borrowAmountFormatted * priceResult.price;

    // Clean up collateralAssets to only include display fields
    const displayCollateralAssets = collateralAssets.map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      amount: asset.amount,
      amountUsd: asset.amountUsd,
      priceSource: asset.priceSource,
    }));

    // Calculate health factor
    // Health Factor = (Total Collateral × Liquidation Threshold) / Total Debt
    // If health factor < 1, the position can be liquidated
    const healthFactor = borrowAmountUsd > 0
      ? (totalCollateralUsd * weightedAvgLiquidationThreshold) / borrowAmountUsd
      : null; // null if no debt

    return {
      asset: reserve.reserve.symbol,
      assetName: reserve.reserve.name,
      borrowAmount: reserve.currentTotalDebt,
      borrowAmountFormatted: borrowAmountFormatted,
      borrowAmountUsd: borrowAmountUsd,
      variableDebt: reserve.currentVariableDebt,
      stableDebt: reserve.currentStableDebt,
      borrowRate: parseFloat(reserve.stableBorrowRate) > 0 ? reserve.stableBorrowRate : reserve.reserve.variableBorrowRate,
      borrowRateFormatted: (parseFloat(reserve.stableBorrowRate) > 0
        ? parseFloat(reserve.stableBorrowRate)
        : parseFloat(reserve.reserve.variableBorrowRate)) / 1e27,
      collateralAmount: '', // Not applicable for aggregate collateral
      collateralAmountFormatted: 0, // Not applicable for aggregate collateral
      collateralAmountUsd: totalCollateralUsd, // Total collateral across all assets
      collateralAssets: displayCollateralAssets, // List of all collateral assets
      decimals: reserve.reserve.decimals,
      liquidationThreshold: weightedAvgLiquidationThreshold, // Weighted average based on collateral
      maxLTV: parseFloat(reserve.reserve.baseLTVasCollateral) / 10000, // Convert basis points to decimal
      usageAsCollateral: reserve.usageAsCollateralEnabledOnUser,
      healthFactor: healthFactor, // Health factor for this position
    };
  });
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

    // Fetch data from all chains in parallel
    const [arbitrumUser, baseUser, avalancheUser, bnbUser, sonicUser] = await Promise.all([
      fetchAaveData(walletAddress, AAVE_SUBGRAPHS.arbitrum),
      fetchAaveData(walletAddress, AAVE_SUBGRAPHS.base),
      fetchAaveData(walletAddress, AAVE_SUBGRAPHS.avalanche),
      fetchAaveData(walletAddress, AAVE_SUBGRAPHS.bnb),
      fetchAaveData(walletAddress, AAVE_SUBGRAPHS.sonic),
    ]);

    // Process positions for all chains in parallel
    const [arbitrumPositions, basePositions, avalanchePositions, bnbPositions, sonicPositions] = await Promise.all([
      processPositions(arbitrumUser),
      processPositions(baseUser),
      processPositions(avalancheUser),
      processPositions(bnbUser),
      processPositions(sonicUser),
    ]);

    res.json({
      success: true,
      data: {
        arbitrum: {
          chainId: CHAIN_IDS.arbitrum,
          chainName: 'Arbitrum',
          positions: arbitrumPositions,
        },
        base: {
          chainId: CHAIN_IDS.base,
          chainName: 'Base',
          positions: basePositions,
        },
        avalanche: {
          chainId: CHAIN_IDS.avalanche,
          chainName: 'Avalanche',
          positions: avalanchePositions,
        },
        bnb: {
          chainId: CHAIN_IDS.bnb,
          chainName: 'BNB Chain',
          positions: bnbPositions,
        },
        sonic: {
          chainId: CHAIN_IDS.sonic,
          chainName: 'Sonic',
          positions: sonicPositions,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching AAVE positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
