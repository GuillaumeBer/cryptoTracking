import express, { Request, Response } from 'express';
import { binanceService } from '../services/binance';
import { onchainService } from '../services/onchain';
import { additionalChainsService } from '../services/additional-chains';
import { bnbScanner } from '../services/bnb-scanner';
import { portfolioAggregator } from '../services/portfolio-aggregator';
import {
  HyperliquidClearinghouseState,
  HyperliquidPriceData,
  HyperliquidSpotState,
  HyperliquidFundingItem,
  HyperliquidUserFill,
  HyperliquidMetaAndAssetCtxs,
  HyperliquidFundingHistoryItem,
} from '../types/hyperliquid';

const router = express.Router();

interface DeltaNeutralAction {
  action: 'buy' | 'sell' | 'increase_short' | 'decrease_short';
  amount: number;
  reason: string;
}

interface FundingRateData {
  currentRate: number; // Current funding rate (hourly rate)
  currentRateApr: number; // Annualized APR
  nextFundingTime: number; // Timestamp of next funding
  avgRate7d: number; // 7-day average funding rate (hourly)
  avgRate7dApr: number; // 7-day average APR
  history: Array<{ time: number; rate: number; rateApr: number }>; // Last 168 funding periods (7 days)
  estimatedDailyRevenue: number; // Estimated daily revenue in USD at current rate
  estimatedMonthlyRevenue: number; // Estimated monthly revenue in USD at current rate
}

interface HyperliquidPosition {
  coin: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  positionSize: number; // negative for shorts
  positionValueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  leverage: number;
  distanceToLiquidation: number; // percentage
  distanceToLiquidationUsd: number;
  fundingPnl?: number; // Total funding earned/paid (all time)
  currentSessionFunding?: number; // Funding for current 8-hour session
  spotBalance?: number; // Spot balance from wallet/binance
  isDeltaNeutral?: boolean; // Whether position is matched with spot
  deltaImbalance?: number; // Difference between short and spot (in coins)
  deltaImbalanceValue?: number; // Value of imbalance in USD
  deltaNeutralAction?: DeltaNeutralAction; // Recommendation to reach delta neutral
  hyperliquidFees?: number; // Total fees paid on Hyperliquid (all time)
  binanceEquivalentFees?: number; // Estimated Binance SPOT fees for equivalent trades
  totalFees?: number; // Total fees (Hyperliquid + Binance equivalent)
  futureClosingFees?: number; // Estimated fees to close both positions
  netGain?: number; // Net gain after all fees and imbalance: fundingPnl - totalFees - futureClosingFees
  netGainAdjusted?: number;
  tradeCount?: number;
  fundingRate?: FundingRateData;
  fundingHistoryRaw?: any[]; // For debugging
}


router.get('/', async (req: Request, res: Response) => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
    }

    console.log(`Fetching Hyperliquid positions for address: ${address}`);

    // Fetch data from Hyperliquid API
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: address,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.statusText}`);
    }

    const data = await response.json() as HyperliquidClearinghouseState;
    console.log('Hyperliquid API response:', JSON.stringify(data, null, 2));

    // Parse positions
    const positions: HyperliquidPosition[] = [];

    if (data.assetPositions && Array.isArray(data.assetPositions)) {
      for (const position of data.assetPositions) {
        const positionData = position.position;
        const coin = positionData.coin;
        const szi = parseFloat(positionData.szi); // Position size (negative for short)

        // Skip if no position
        if (szi === 0) continue;

        const entryPrice = parseFloat(positionData.entryPx || '0');
        const positionValue = parseFloat(positionData.positionValue || '0');
        const unrealizedPnl = parseFloat(positionData.unrealizedPnl || '0');
        const marginUsed = parseFloat(positionData.marginUsed || '0');
        const leverage = parseFloat(positionData.leverage?.value || '1');
        const liquidationPx = parseFloat(positionData.liquidationPx || '0');

        // Fetch current mark price
        let markPrice = entryPrice;
        try {
          const priceResponse = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'allMids',
            }),
          });

          if (priceResponse.ok) {
            const priceData = await priceResponse.json() as HyperliquidPriceData;
            // priceData is an object where keys are coin names and values are prices
            if (priceData[coin]) {
              markPrice = parseFloat(priceData[coin]);
            }
          }
        } catch (err) {
          console.error(`Error fetching mark price for ${coin}:`, err);
        }

        // Calculate metrics
        const unrealizedPnlPercent = positionValue !== 0 ? (unrealizedPnl / Math.abs(positionValue)) * 100 : 0;

        // For shorts: liquidation happens when price goes UP
        // Distance to liquidation = (liquidationPrice - markPrice) / markPrice * 100
        const distanceToLiquidation = liquidationPx !== 0
          ? Math.abs((liquidationPx - markPrice) / markPrice) * 100
          : 100;

        const distanceToLiquidationUsd = Math.abs((liquidationPx - markPrice) * Math.abs(szi));

        positions.push({
          coin,
          entryPrice,
          markPrice,
          liquidationPrice: liquidationPx,
          positionSize: szi,
          positionValueUsd: Math.abs(positionValue),
          unrealizedPnl,
          unrealizedPnlPercent,
          margin: marginUsed,
          leverage,
          distanceToLiquidation,
          distanceToLiquidationUsd,
        });
      }
    }

    // Filter only short positions (negative size)
    const shortPositions = positions.filter(p => p.positionSize < 0);

    // Fetch funding rate history for each position (last 7 days)
    // We'll get current rate from the most recent history entry
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const fundingRateHistory: { [coin: string]: FundingRateData } = {};

    for (const position of shortPositions) {
      const coin = position.coin;

      // Initialize with default values
      const defaultFundingData: FundingRateData = {
        currentRate: 0,
        currentRateApr: 0,
        nextFundingTime: 0,
        avgRate7d: 0,
        avgRate7dApr: 0,
        history: [],
        estimatedDailyRevenue: 0,
        estimatedMonthlyRevenue: 0,
      };

      try {
        const historyResponse = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'fundingHistory',
            coin: coin,
            startTime: sevenDaysAgo,
          }),
        });

        if (historyResponse.ok) {
          const historyData = await historyResponse.json() as HyperliquidFundingHistoryItem[];

          if (Array.isArray(historyData) && historyData.length > 0) {
            // Get current rate from most recent funding history entry
            const sortedHistory = [...historyData].sort((a, b) => b.time - a.time);
            const currentRate = parseFloat(sortedHistory[0].fundingRate);
            const currentRateApr = currentRate * 24 * 365 * 100;

            // Calculate 7-day average
            const rates = historyData.map(h => parseFloat(h.fundingRate));
            const avgRate7d = rates.reduce((sum, r) => sum + r, 0) / rates.length;
            const avgRate7dApr = avgRate7d * 24 * 365 * 100;

            // Create history array with timestamps and rates
            const history = historyData.map(h => ({
              time: h.time,
              rate: parseFloat(h.fundingRate),
              rateApr: parseFloat(h.fundingRate) * 24 * 365 * 100,
            })).sort((a, b) => a.time - b.time);

            // Calculate next funding time (every hour on the hour)
            const now = new Date();
            const nextFundingTime = new Date(now);
            nextFundingTime.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);

            // Estimate daily/monthly revenue
            const positionValue = position.positionValueUsd;
            const estimatedDailyRevenue = positionValue * currentRate * 24;
            const estimatedMonthlyRevenue = estimatedDailyRevenue * 30;

            fundingRateHistory[coin] = {
              currentRate,
              currentRateApr,
              nextFundingTime: nextFundingTime.getTime(),
              avgRate7d,
              avgRate7dApr,
              history: history.slice(-168),
              estimatedDailyRevenue,
              estimatedMonthlyRevenue,
            };
          } else {
            fundingRateHistory[coin] = defaultFundingData;
          }
        } else {
          fundingRateHistory[coin] = defaultFundingData;
        }
      } catch (err) {
        console.error(`Error fetching funding history for ${coin}:`, err);
        fundingRateHistory[coin] = defaultFundingData;
      }
    }

    // Fetch trade history (userFills) to calculate fees
    const fillsResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'userFills',
        user: address,
      }),
    });

    const hyperliquidFeesByCoin: { [coin: string]: number } = {};
    const binanceFeesByCoin: { [coin: string]: number } = {};
    const tradeCountByCoin: { [coin: string]: number } = {};
    const BINANCE_SPOT_FEE_RATE = 0.001; // 0.1% standard rate

    if (fillsResponse.ok) {
      const fills = (await fillsResponse.json()) as HyperliquidUserFill[];

      if (Array.isArray(fills)) {
        fills.forEach((fill) => {
          const coin = fill.coin;
          const hyperliquidFee = parseFloat(fill.fee || '0');
          const builderFee = parseFloat(fill.builderFee || '0');
          const totalHyperliquidFee = hyperliquidFee + builderFee;

          // Calculate trade value in USDC
          const tradeValue = parseFloat(fill.px) * parseFloat(fill.sz);
          const binanceFee = tradeValue * BINANCE_SPOT_FEE_RATE;

          // Accumulate fees by coin
          if (!hyperliquidFeesByCoin[coin]) {
            hyperliquidFeesByCoin[coin] = 0;
            binanceFeesByCoin[coin] = 0;
            tradeCountByCoin[coin] = 0;
          }

          hyperliquidFeesByCoin[coin] += totalHyperliquidFee;
          binanceFeesByCoin[coin] += binanceFee;
          tradeCountByCoin[coin]++;
        });
      }
    }

    // Fetch funding history
    const fundingResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'userFunding',
        user: address,
        startTime: 0, // Fetch all time
      }),
    });

    let totalFundingPnl = 0;
    const fundingByCoin: { [coin: string]: number } = {};
    const currentSessionFundingByCoin: { [coin: string]: number } = {};

    if (fundingResponse.ok) {
      const fundingData = (await fundingResponse.json()) as HyperliquidFundingItem[];

      if (Array.isArray(fundingData)) {
        // Hyperliquid funding occurs every 8 hours
        const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);

        fundingData.forEach((item) => {
          if (item.delta && item.delta.type === 'funding') {
            const coin = item.delta.coin;
            const fundingAmount = parseFloat(item.delta.usdc);
            const fundingTime = item.time;

            // All-time funding
            if (!fundingByCoin[coin]) {
              fundingByCoin[coin] = 0;
            }
            fundingByCoin[coin] += fundingAmount;
            totalFundingPnl += fundingAmount;

            // Current session (last 8 hours)
            if (fundingTime > eightHoursAgo) {
              if (!currentSessionFundingByCoin[coin]) {
                currentSessionFundingByCoin[coin] = 0;
              }
              currentSessionFundingByCoin[coin] += fundingAmount;
            }
          }
        });

        // Add funding PnL and raw history to positions
        shortPositions.forEach((position) => {
          position.fundingPnl = fundingByCoin[position.coin] || 0;
          position.currentSessionFunding = currentSessionFundingByCoin[position.coin] || 0;
          position.fundingHistoryRaw = fundingData.filter(item => item.delta && item.delta.type === 'funding' && item.delta.coin === position.coin);
        });
      }
    }

    // Add fee data to each position (net gain will be calculated later with spot balances)
    shortPositions.forEach((position) => {
      const coin = position.coin;

      position.hyperliquidFees = hyperliquidFeesByCoin[coin] || 0;
      position.binanceEquivalentFees = binanceFeesByCoin[coin] || 0;
      position.totalFees = position.hyperliquidFees + position.binanceEquivalentFees;
      position.tradeCount = tradeCountByCoin[coin] || 0;
    });

    // Fetch spot balances from Hyperliquid wallet
    const spotResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'spotClearinghouseState',
        user: address,
      }),
    });

    const spotBalances: { [coin: string]: number } = {};
    if (spotResponse.ok) {
      const spotData = await spotResponse.json() as HyperliquidSpotState;
      if (spotData.balances && Array.isArray(spotData.balances)) {
        spotData.balances.forEach((balance) => {
          const coin = balance.coin;
          const total = parseFloat(balance.total || '0');
          if (total > 0) {
            spotBalances[coin] = total;
          }
        });
      }
    }

    // Fetch ONLY redeemable Flexible Earn balances from Binance (excludes Spot and Locked)
    if (binanceService.isConfigured()) {
      try {
        const binanceBalances = await binanceService.getRedeemableEarnBalances();

        // Merge Binance balances with Hyperliquid balances
        Object.keys(binanceBalances).forEach((coin) => {
          if (spotBalances[coin]) {
            spotBalances[coin] += binanceBalances[coin];
          } else {
            spotBalances[coin] = binanceBalances[coin];
          }
        });

        console.log(`✅ Merged Binance redeemable Flexible Earn balances with Hyperliquid balances`);
      } catch (error) {
        console.error('Error fetching Binance balances:', error);
        // Continue without Binance balances if there's an error
      }
    } else {
      console.log('ℹ️  Binance not configured, using only Hyperliquid spot balances');
    }

    // Fetch onchain balances from all EVM chains
    if (onchainService.isConfigured()) {
      try {
        const onchainBalances = await onchainService.getAllOnchainBalances(address);

        // Merge onchain balances with existing balances
        Object.keys(onchainBalances).forEach((coin) => {
          spotBalances[coin] = (spotBalances[coin] || 0) + onchainBalances[coin];
        });

        console.log(`✅ Merged onchain balances from Ethereum, Polygon, Arbitrum, Optimism, Base`);
      } catch (error) {
        console.error('Error fetching onchain balances:', error);
        // Continue without onchain balances if there's an error
      }
    }

    // Fetch balances from BNB Chain using scanner (includes all ERC20 tokens)
    try {
      console.log(`🔗 Fetching BNB Chain tokens (including ERC20)...`);
      const bnbTokens = await bnbScanner.scanWallet(address, 0.01); // Min $0.01 value

      // Merge BNB Chain token balances
      if (Array.isArray(bnbTokens)) {
        bnbTokens.forEach((token) => {
          spotBalances[token.symbol] = (spotBalances[token.symbol] || 0) + token.balance;
        });

        console.log(`✅ Merged ${bnbTokens.length} tokens from BNB Chain (found: ${bnbTokens.map(t => t.symbol).join(', ')})`);
      }
    } catch (error) {
      console.error('Error fetching BNB Chain tokens:', error);
      // Continue without BNB Chain tokens if there's an error
    }

    // Fetch balances from Sonic
    if (additionalChainsService.isConfigured()) {
      try {
        const additionalBalances = await additionalChainsService.getAllBalances(address);

        // Merge Sonic balances (BNB already handled by scanner above)
        Object.keys(additionalBalances).forEach((coin) => {
          // Skip BNB since it's already included by the scanner
          if (coin !== 'BNB') {
            spotBalances[coin] = (spotBalances[coin] || 0) + additionalBalances[coin];
          }
        });

        console.log(`✅ Merged balances from Sonic`);
      } catch (error) {
        console.error('Error fetching Sonic balances:', error);
        // Continue without Sonic balances if there's an error
      }
    }

    // OPTIONAL: Use Portfolio Aggregator for comprehensive cross-chain balance check
    // Uncomment to include Solana, Cosmos (ATOM, OSMO, TIA, INJ), and Sui balances
    /*
    try {
      console.log(`🌐 Fetching portfolio from all chains (Solana, Cosmos, Sui)...`);
      const portfolio = await portfolioAggregator.getPortfolio();

      // Merge all token balances from portfolio
      portfolio.chains.forEach(chain => {
        chain.tokens.forEach(token => {
          spotBalances[token.symbol] = (spotBalances[token.symbol] || 0) + token.balance;
        });
      });

      console.log(`✅ Merged balances from ${portfolio.chains.length} additional chains`);
    } catch (error) {
      console.error('Error fetching portfolio aggregator balances:', error);
    }
    */

    // Match positions with spot balances for delta neutral detection and calculate adjusted net gain
    shortPositions.forEach((position) => {
      const spotBalance = spotBalances[position.coin] || 0;
      position.spotBalance = spotBalance;

      const shortSize = Math.abs(position.positionSize);
      position.deltaImbalance = shortSize - spotBalance;

      // Calculate value of imbalance in USD
      position.deltaImbalanceValue = Math.abs(position.deltaImbalance) * position.markPrice;

      // Consider delta neutral if difference is less than 5%
      const maxSize = Math.max(shortSize, spotBalance);
      const imbalancePercent = maxSize > 0 ? (Math.abs(position.deltaImbalance) / maxSize) * 100 : 0;
      position.isDeltaNeutral = maxSize > 0 && imbalancePercent < 5;

      // Calculate future closing fees
      // Hyperliquid: Assume 0.05% taker fee to close short
      const hyperliquidClosingFee = position.positionValueUsd * 0.0005;
      // Binance: 0.1% to sell spot position
      const binanceClosingFee = (spotBalance * position.markPrice) * 0.001;
      position.futureClosingFees = hyperliquidClosingFee + binanceClosingFee;

      // Calculate adjusted net gain
      // If more short than spot (positive deltaImbalance): we have unhedged short exposure (bearish exposure)
      // If more spot than long (negative deltaImbalance): we have unhedged long exposure (bullish exposure)
      // We don't directly subtract imbalance value as it's not a realized loss, but it's a risk exposure

      // Net gain considering all fees (past + future)
      const fundingRevenue = position.fundingPnl || 0;
      const totalHistoricalFees = position.totalFees || 0;
      position.netGain = fundingRevenue - totalHistoricalFees - position.futureClosingFees;

      // Adjusted net gain: Consider the imbalance as a risk factor
      // For a conservative estimate, we can consider the imbalance value as potential exposure
      // However, since it's not a realized P&L, we'll keep it separate for now
      position.netGainAdjusted = position.netGain;

      // Generate recommendation if not delta neutral
      if (!position.isDeltaNeutral && maxSize > 0) {
        const imbalance = position.deltaImbalance;

        if (imbalance > 0) {
          // More short than spot: need to buy spot or reduce short
          position.deltaNeutralAction = {
            action: 'buy',
            amount: Math.abs(imbalance),
            reason: `You have ${Math.abs(imbalance).toFixed(2)} ${position.coin} more in short than spot (${imbalancePercent.toFixed(1)}% imbalance). Buy ${Math.abs(imbalance).toFixed(2)} ${position.coin} on spot to reach delta neutral.`
          };
        } else {
          // More spot than short: need to sell spot or increase short
          position.deltaNeutralAction = {
            action: 'sell',
            amount: Math.abs(imbalance),
            reason: `You have ${Math.abs(imbalance).toFixed(2)} ${position.coin} more in spot than short (${imbalancePercent.toFixed(1)}% imbalance). Sell ${Math.abs(imbalance).toFixed(2)} ${position.coin} from spot to reach delta neutral.`
          };
        }
      }
    });

    // Attach funding rate data to positions
    shortPositions.forEach((position) => {
      if (fundingRateHistory[position.coin]) {
        position.fundingRate = fundingRateHistory[position.coin];
      }
    });

    res.json({
      success: true,
      data: {
        address,
        positions: shortPositions,
        totalFundingPnl,
        spotBalances,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching Hyperliquid data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;