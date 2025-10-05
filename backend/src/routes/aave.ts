import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// AAVE V3 Subgraph endpoints
const GRAPH_API_KEY = 'dec44da04027010f04ba25886c2d62ab';

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

// Price cache to avoid excessive API calls
const priceCache: { [key: string]: { price: number; timestamp: number; source: string } } = {};
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Map token symbols to Binance trading pairs (prefer Binance for better rate limits)
const BINANCE_SYMBOL_MAP: { [key: string]: string } = {
  'USDC': 'USDCUSDT',
  'USDC.e': 'USDCUSDT',
  'USDCn': 'USDCUSDT',
  'USDT': 'USDTUSD', // Special case: USDT is always ~$1
  'DAI': 'DAIUSDT',
  'WETH': 'ETHUSDT',
  'ETH': 'ETHUSDT',
  'WBTC': 'BTCUSDT',
  'WMATIC': 'MATICUSDT',
  'MATIC': 'MATICUSDT',
  'AAVE': 'AAVEUSDT',
  'LINK': 'LINKUSDT',
  'ARB': 'ARBUSDT',
  'AVAX': 'AVAXUSDT',
  'WAVAX': 'AVAXUSDT',
  'BNB': 'BNBUSDT',
  'WBNB': 'BNBUSDT',
};

// Map token symbols to CoinGecko IDs (fallback for tokens not on Binance)
const COINGECKO_SYMBOL_MAP: { [key: string]: string } = {
  'weETH': 'wrapped-eeth',
  'wstETH': 'wrapped-steth',
  'sAVAX': 'benqi-liquid-staked-avax',
  'S': 'sonic-3',
  'wS': 'sonic-3',
  'SONIC': 'sonic-3',
};

// Fallback prices when all APIs fail
const FALLBACK_PRICES: { [key: string]: number } = {
  'USDC': 1,
  'USDC.e': 1,
  'USDCn': 1,
  'USDT': 1,
  'DAI': 1,
  'WETH': 3300,
  'ETH': 3300,
  'weETH': 3450,
  'wstETH': 3900,
  'WBTC': 97000,
  'WMATIC': 0.45,
  'MATIC': 0.45,
  'AAVE': 320,
  'LINK': 21,
  'ARB': 0.75,
  'AVAX': 35,
  'WAVAX': 35,
  'sAVAX': 38,
  'BNB': 620,
  'WBNB': 620,
  'S': 0.27,
  'wS': 0.27,
  'SONIC': 0.27,
};

// Fetch prices from Binance API
async function fetchBinancePrices(symbols: string[]): Promise<{ [symbol: string]: number }> {
  const result: { [symbol: string]: number } = {};
  const binanceSymbols: string[] = [];
  const symbolMap: { [binanceSymbol: string]: string } = {};

  // Map symbols to Binance trading pairs
  for (const symbol of symbols) {
    const binanceSymbol = BINANCE_SYMBOL_MAP[symbol];
    if (binanceSymbol) {
      binanceSymbols.push(binanceSymbol);
      symbolMap[binanceSymbol] = symbol;
    }
  }

  if (binanceSymbols.length === 0) {
    return result;
  }

  try {
    // Fetch all prices from Binance in a single call
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');

    if (!response.ok) {
      console.warn(`Binance API error: ${response.statusText}`);
      return result;
    }

    const data: any[] = await response.json();

    // Extract prices for our symbols
    for (const ticker of data) {
      const originalSymbol = symbolMap[ticker.symbol];
      if (originalSymbol) {
        const price = parseFloat(ticker.price);
        result[originalSymbol] = price;
      }
    }

    // Special case for USDT (always ~$1)
    if (symbolMap['USDTUSD']) {
      result['USDT'] = 1;
    }

    return result;
  } catch (error) {
    console.warn('Error fetching Binance prices:', error);
    return result;
  }
}

// Fetch prices from CoinGecko API (fallback for tokens not on Binance)
async function fetchCoinGeckoPrices(symbols: string[]): Promise<{ [symbol: string]: number }> {
  const result: { [symbol: string]: number } = {};
  const coinGeckoIds: string[] = [];
  const idMap: { [id: string]: string } = {};

  // Map symbols to CoinGecko IDs
  for (const symbol of symbols) {
    const coinGeckoId = COINGECKO_SYMBOL_MAP[symbol];
    if (coinGeckoId) {
      coinGeckoIds.push(coinGeckoId);
      idMap[coinGeckoId] = symbol;
    }
  }

  if (coinGeckoIds.length === 0) {
    return result;
  }

  try {
    const idsParam = coinGeckoIds.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`CoinGecko API error: ${response.statusText}`);
      return result;
    }

    const data: any = await response.json();

    // Extract prices for our symbols
    for (const [coinGeckoId, symbol] of Object.entries(idMap)) {
      if (data[coinGeckoId]?.usd) {
        result[symbol] = data[coinGeckoId].usd;
      }
    }

    return result;
  } catch (error) {
    console.warn('Error fetching CoinGecko prices:', error);
    return result;
  }
}

// Batch fetch multiple token prices using Binance (preferred) and CoinGecko (fallback)
async function fetchMultipleTokenPrices(symbols: string[]): Promise<{ [symbol: string]: { price: number; source: string } }> {
  const now = Date.now();
  const uncachedSymbols: string[] = [];
  const result: { [symbol: string]: { price: number; source: string } } = {};

  // Check cache for each symbol
  for (const symbol of symbols) {
    if (priceCache[symbol] && (now - priceCache[symbol].timestamp) < PRICE_CACHE_DURATION) {
      result[symbol] = { price: priceCache[symbol].price, source: priceCache[symbol].source };
    } else {
      uncachedSymbols.push(symbol);
    }
  }

  // If all symbols are cached, return immediately
  if (uncachedSymbols.length === 0) {
    return result;
  }

  // Separate symbols into Binance and CoinGecko
  const binanceSymbols = uncachedSymbols.filter(s => BINANCE_SYMBOL_MAP[s]);
  const coinGeckoSymbols = uncachedSymbols.filter(s => COINGECKO_SYMBOL_MAP[s]);

  // Fetch from both APIs in parallel
  const [binancePrices, coinGeckoPrices] = await Promise.all([
    fetchBinancePrices(binanceSymbols),
    fetchCoinGeckoPrices(coinGeckoSymbols),
  ]);

  // Merge results and cache
  for (const symbol of uncachedSymbols) {
    let price: number;
    let source: string;

    if (binancePrices[symbol]) {
      price = binancePrices[symbol];
      source = 'binance';
    } else if (coinGeckoPrices[symbol]) {
      price = coinGeckoPrices[symbol];
      source = 'coingecko';
    } else if (FALLBACK_PRICES[symbol]) {
      price = FALLBACK_PRICES[symbol];
      source = 'fallback';
    } else {
      price = 1;
      source = 'default';
    }

    priceCache[symbol] = { price, timestamp: now, source };
    result[symbol] = { price, source };
  }

  return result;
}

async function fetchTokenPrice(symbol: string): Promise<{ price: number; source: string }> {
  const prices = await fetchMultipleTokenPrices([symbol]);
  return prices[symbol] || { price: 1, source: 'default' };
}

// Helper function to calculate USD value
async function calculateUSDValue(amount: string, decimals: number, symbol: string): Promise<number> {
  const normalizedAmount = parseFloat(amount) / Math.pow(10, decimals);
  const priceData = await fetchTokenPrice(symbol);
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

  // Batch fetch all prices at once
  const prices = await fetchMultipleTokenPrices(Array.from(allSymbols));

  // Calculate collateral assets with pre-fetched prices and liquidation thresholds
  const collateralAssets = collateralReserves.map(reserve => {
    const amount = parseFloat(reserve.currentATokenBalance) / Math.pow(10, reserve.reserve.decimals);
    const priceData = prices[reserve.reserve.symbol] || { price: 1, source: 'default' };
    const amountUsd = amount * priceData.price;
    const liquidationThreshold = parseFloat(reserve.reserve.reserveLiquidationThreshold) / 10000;
    return {
      symbol: reserve.reserve.symbol,
      name: reserve.reserve.name,
      amount: amount,
      amountUsd: amountUsd,
      priceSource: priceData.source,
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
    const priceData = prices[reserve.reserve.symbol] || { price: 1, source: 'default' };
    const borrowAmountUsd = borrowAmountFormatted * priceData.price;

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
