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
  fundingPnl?: number; // Funding earned/paid since last position size change
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
  hyperliquidFeesSinceChange?: number;
  binanceEquivalentFeesSinceChange?: number;
  totalFeesSinceChange?: number;
  netGain?: number; // Net gain after all fees and imbalance: fundingPnl - totalFees - futureClosingFees
  netGainAdjusted?: number;
  netRevenueCurrent?: number;
  netRevenueAllTime?: number;
  tradeCount?: number;
  fundingRate?: FundingRateData;
  fundingHistoryRaw?: any[]; // For debugging
  fundingPnlAllTime?: number; // Total funding accrued historically
  openTimestamp?: number | null; // Timestamp when the current short was opened
  lastChangeTimestamp?: number | null; // Timestamp of the last position size change
  fundingPnlSinceOpen?: number; // Funding earned since the position was opened
}

interface HyperliquidOpportunity {
  coin: string;
  markPrice: number;
  oraclePrice: number | null;
  fundingRateHourly: number;
  fundingRateDaily: number;
  fundingRateAnnualized: number;
  openInterestBase: number;
  openInterestUsd: number;
  dayNotionalVolumeUsd: number;
  dayBaseVolume?: number;
  premium?: number | null;
  direction: 'short' | 'long';
  opportunityScore: number;
  liquidityScore: number;
  volumeScore: number;
  expectedDailyReturnPercent: number;
  estimatedDailyPnlUsd: number;
  estimatedMonthlyPnlUsd: number;
  notionalUsd: number;
  maxLeverage?: number;
  szDecimals?: number;
  onlyIsolated?: boolean;
  marginTableId?: number;
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

        const normalizeFunding = (value?: string): number | undefined => {
          if (value === undefined || value === null) return undefined;
          const parsed = parseFloat(value);
          if (Number.isNaN(parsed)) return undefined;
          // Hyperliquid returns negative values for funding earned on shorts.
          return -parsed;
        };

        const fundingAllTime = normalizeFunding(positionData.cumFunding?.allTime);
        const fundingSinceChange = normalizeFunding(positionData.cumFunding?.sinceChange);
        const fundingSinceOpen = normalizeFunding(positionData.cumFunding?.sinceOpen);

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
          fundingPnl: fundingSinceChange ?? fundingSinceOpen ?? undefined,
          fundingPnlAllTime: fundingAllTime,
          fundingPnlSinceOpen: fundingSinceOpen,
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
    const positionOpenTimestamps: { [coin: string]: number | null } = {};
    const positionChangeTimestamps: { [coin: string]: number | null } = {};
    const feeEventsByCoin: {
      [coin: string]: Array<{ time: number; hyperliquidFee: number; binanceFee: number }>;
    } = {};

    if (fillsResponse.ok) {
      const fills = (await fillsResponse.json()) as HyperliquidUserFill[];

      if (Array.isArray(fills)) {
        const sortedFills = [...fills].sort((a, b) => a.time - b.time);
        const MIN_POSITION_SIZE = 1e-9;
        const shortStateByCoin: {
          [coin: string]: {
            openTimestamp: number | null;
            lastChangeTimestamp: number | null;
            shortSize: number;
          };
        } = {};

        sortedFills.forEach((fill) => {
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
          if (!feeEventsByCoin[coin]) {
            feeEventsByCoin[coin] = [];
          }
          feeEventsByCoin[coin].push({
            time: fill.time,
            hyperliquidFee: totalHyperliquidFee,
            binanceFee,
          });

          // Track lifecycle of short positions to determine when the current short was opened
          const dir = (fill.dir || '').toLowerCase();
          if (dir.includes('short')) {
            const size = Math.abs(parseFloat(fill.sz || '0'));
            if (!shortStateByCoin[coin]) {
              shortStateByCoin[coin] = { openTimestamp: null, lastChangeTimestamp: null, shortSize: 0 };
            }

            const state = shortStateByCoin[coin];
            const isIncreasing = dir.includes('open') || dir.includes('increase');
            const isDecreasing = dir.includes('close') || dir.includes('decrease') || dir.includes('reduce');

            if (isIncreasing) {
              const wasFlat = state.shortSize <= MIN_POSITION_SIZE;
              state.shortSize += size;
              if (state.shortSize > MIN_POSITION_SIZE) {
                state.lastChangeTimestamp = fill.time;
                if (wasFlat) {
                  state.openTimestamp = fill.time;
                }
              }
            } else if (isDecreasing) {
              state.shortSize = Math.max(0, state.shortSize - size);
              if (state.shortSize <= MIN_POSITION_SIZE) {
                state.shortSize = 0;
                state.openTimestamp = null;
                state.lastChangeTimestamp = null;
              } else {
                state.lastChangeTimestamp = fill.time;
              }
            }
          }
        });

        Object.entries(shortStateByCoin).forEach(([coin, state]) => {
          if (state.shortSize > MIN_POSITION_SIZE) {
            positionOpenTimestamps[coin] = state.openTimestamp ?? null;
            positionChangeTimestamps[coin] = state.lastChangeTimestamp ?? state.openTimestamp ?? null;
          }
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

    const fundingByCoinAllTime: { [coin: string]: number } = {};
    const fundingByCoinSinceChange: { [coin: string]: number } = {};
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
            if (!fundingByCoinAllTime[coin]) {
              fundingByCoinAllTime[coin] = 0;
            }
            fundingByCoinAllTime[coin] += fundingAmount;

            // Funding since the current short was last changed (fallback to open time)
            const sinceTimestamp = positionChangeTimestamps[coin] ?? positionOpenTimestamps[coin];
            if (sinceTimestamp !== null && sinceTimestamp !== undefined) {
              if (!fundingByCoinSinceChange[coin]) {
                fundingByCoinSinceChange[coin] = 0;
              }
              if (fundingTime >= sinceTimestamp) {
                fundingByCoinSinceChange[coin] += fundingAmount;
              }
            }

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
          const coin = position.coin;
          const openTimestamp = positionOpenTimestamps[coin] ?? null;
          const changeTimestamp = positionChangeTimestamps[coin] ?? null;
          position.openTimestamp = openTimestamp ?? null;
          position.lastChangeTimestamp = changeTimestamp ?? null;

          if (position.fundingPnlAllTime === undefined) {
            position.fundingPnlAllTime = fundingByCoinAllTime[coin] || 0;
          }

          if (position.fundingPnl === undefined) {
            const sinceTimestamp = changeTimestamp ?? openTimestamp;
            if (sinceTimestamp !== null && sinceTimestamp !== undefined) {
              position.fundingPnl = fundingByCoinSinceChange[coin] ?? position.fundingPnlAllTime ?? 0;
            } else {
              position.fundingPnl = position.fundingPnlAllTime ?? 0;
            }
          }

          position.currentSessionFunding = currentSessionFundingByCoin[position.coin] || 0;
          position.fundingHistoryRaw = fundingData.filter(item => item.delta && item.delta.type === 'funding' && item.delta.coin === position.coin);
        });
      }
    }

    // Add fee data to each position (net gain will be calculated later with spot balances)
    shortPositions.forEach((position) => {
      const coin = position.coin;
      const allHyperliquidFees = hyperliquidFeesByCoin[coin] || 0;
      const allBinanceFees = binanceFeesByCoin[coin] || 0;
      const changeTimestamp = positionChangeTimestamps[coin] ?? position.openTimestamp ?? null;

      let currentHyperliquidFees = allHyperliquidFees;
      let currentBinanceFees = allBinanceFees;
      if (changeTimestamp !== null && changeTimestamp !== undefined) {
        const events = feeEventsByCoin[coin] || [];
        currentHyperliquidFees = events.reduce((sum, event) => {
          if (event.time >= changeTimestamp) {
            return sum + event.hyperliquidFee;
          }
          return sum;
        }, 0);
        currentBinanceFees = events.reduce((sum, event) => {
          if (event.time >= changeTimestamp) {
            return sum + event.binanceFee;
          }
          return sum;
        }, 0);
      }

      position.hyperliquidFees = allHyperliquidFees;
      position.binanceEquivalentFees = allBinanceFees;
      position.hyperliquidFeesSinceChange = currentHyperliquidFees;
      position.binanceEquivalentFeesSinceChange = currentBinanceFees;
      position.totalFees = allHyperliquidFees + allBinanceFees;
      position.totalFeesSinceChange = currentHyperliquidFees + currentBinanceFees;
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

      const futureClosingFees = position.futureClosingFees || 0;
      const fundingCurrent = position.fundingPnl ?? 0;
      const fundingAllTime = position.fundingPnlAllTime ?? fundingCurrent;
      const totalFeesAllTime = position.totalFees ?? 0;
      const totalFeesCurrent = position.totalFeesSinceChange ?? totalFeesAllTime;

      position.netRevenueCurrent = fundingCurrent - totalFeesCurrent - futureClosingFees;
      position.netRevenueAllTime = fundingAllTime - totalFeesAllTime - futureClosingFees;

      position.netGain = position.netRevenueCurrent;
      position.netGainAdjusted = position.netRevenueAllTime;

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

    const totalFundingPnl = shortPositions.reduce((sum, position) => sum + (position.fundingPnl ?? 0), 0);
    const totalFundingPnlAllTime = shortPositions.reduce(
      (sum, position) => sum + (position.fundingPnlAllTime ?? 0),
      0
    );
    const totalNetRevenueCurrent = shortPositions.reduce(
      (sum, position) => sum + (position.netRevenueCurrent ?? 0),
      0
    );
    const totalNetRevenueAllTime = shortPositions.reduce(
      (sum, position) => sum + (position.netRevenueAllTime ?? 0),
      0
    );

    res.json({
      success: true,
      data: {
        address,
        positions: shortPositions,
        totalFundingPnl,
        totalFundingPnlAllTime,
        totalNetRevenueCurrent,
        totalNetRevenueAllTime,
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

router.get('/opportunities', async (req: Request, res: Response) => {
  const parseStringParam = (value: unknown, defaultValue: string): string => {
    if (Array.isArray(value)) {
      return value.length > 0 ? String(value[0]) : defaultValue;
    }
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const strValue = String(value).trim();
    return strValue.length > 0 ? strValue : defaultValue;
  };

  const parseNumericParam = (value: unknown, defaultValue: number): number => {
    const raw = parseStringParam(value, String(defaultValue));
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const limit = clamp(Math.round(parseNumericParam(req.query.limit, 15)), 1, 100);
  const minOpenInterestUsd = Math.max(0, parseNumericParam(req.query.minOpenInterestUsd, 500_000));
  const minVolumeUsd = Math.max(0, parseNumericParam(req.query.minVolumeUsd, 250_000));
  const notionalUsd = Math.max(1, parseNumericParam(req.query.notionalUsd, 10_000));

  const directionParam = parseStringParam(req.query.direction, 'short').toLowerCase();
  const sortParam = parseStringParam(req.query.sort, 'score').toLowerCase();

  const directionFilter: 'short' | 'long' | 'all' =
    directionParam === 'long' ? 'long' : directionParam === 'all' ? 'all' : 'short';

  const allowedSorts = new Set(['score', 'funding', 'liquidity', 'volume']);
  const sortKey: 'score' | 'funding' | 'liquidity' | 'volume' = allowedSorts.has(sortParam)
    ? (sortParam as 'score' | 'funding' | 'liquidity' | 'volume')
    : 'score';

  const parseNumber = (value?: string | null): number => {
    if (value === undefined || value === null) return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const computeScores = (fundingRateAnnualized: number, openInterestUsd: number, dayNotionalVolumeUsd: number) => {
    const liquidityScore = Math.min(1, openInterestUsd / 5_000_000);
    const volumeScore = Math.min(1, dayNotionalVolumeUsd / 2_000_000);
    const opportunityScore = Math.abs(fundingRateAnnualized) * (0.6 + 0.25 * liquidityScore + 0.15 * volumeScore);
    return { liquidityScore, volumeScore, opportunityScore };
  };

  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'metaAndAssetCtxs',
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid meta API error: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as HyperliquidMetaAndAssetCtxs;
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new Error('Unexpected Hyperliquid meta payload structure');
    }

    const [metaInfo, assetCtxs] = payload;
    const universe = Array.isArray(metaInfo?.universe) ? metaInfo.universe : [];
    if (!Array.isArray(assetCtxs)) {
      throw new Error('Missing asset contexts in Hyperliquid payload');
    }

    const markets: HyperliquidOpportunity[] = universe
      .map((asset, index) => {
        const ctx = assetCtxs[index];
        if (!ctx) return null;
        if (asset.isDelisted) return null;

        const markPrice = parseNumber(ctx.markPx ?? ctx.oraclePx);
        const oraclePrice = ctx.oraclePx !== undefined ? parseNumber(ctx.oraclePx) : null;
        const effectivePrice = markPrice > 0 ? markPrice : oraclePrice ?? 0;
        if (effectivePrice <= 0) return null;

        const openInterestBase = parseNumber(ctx.openInterest);
        const openInterestUsd = openInterestBase * effectivePrice;
        const dayNotionalVolumeUsd = parseNumber(ctx.dayNtlVlm);
        const dayBaseVolume = parseNumber(ctx.dayBaseVlm);
        const fundingRateHourly = parseNumber(ctx.funding);
        const fundingRateDaily = fundingRateHourly * 24;
        const fundingRateAnnualized = fundingRateHourly * 24 * 365;
        const premium =
          ctx.premium === null || ctx.premium === undefined ? null : parseNumber(ctx.premium);

        const { liquidityScore, volumeScore, opportunityScore } = computeScores(
          fundingRateAnnualized,
          openInterestUsd,
          dayNotionalVolumeUsd,
        );

        const direction: 'short' | 'long' = fundingRateHourly >= 0 ? 'short' : 'long';
        const estimatedDailyPnlUsd = notionalUsd * fundingRateDaily;
        const estimatedMonthlyPnlUsd = estimatedDailyPnlUsd * 30;

        return {
          coin: asset.name,
          markPrice: effectivePrice,
          oraclePrice,
          fundingRateHourly,
          fundingRateDaily,
          fundingRateAnnualized,
          openInterestBase,
          openInterestUsd,
          dayNotionalVolumeUsd,
          dayBaseVolume: dayBaseVolume > 0 ? dayBaseVolume : undefined,
          premium,
          direction,
          opportunityScore,
          liquidityScore,
          volumeScore,
          expectedDailyReturnPercent: fundingRateDaily,
          estimatedDailyPnlUsd,
          estimatedMonthlyPnlUsd,
          notionalUsd,
          maxLeverage: asset.maxLeverage,
          szDecimals: asset.szDecimals,
          onlyIsolated: asset.onlyIsolated,
          marginTableId: asset.marginTableId,
        } as HyperliquidOpportunity;
      })
      .filter((market): market is HyperliquidOpportunity => market !== null);

    const filteredMarkets = markets.filter((market) => {
      if (directionFilter !== 'all' && market.direction !== directionFilter) {
        return false;
      }
      if (market.openInterestUsd < minOpenInterestUsd) {
        return false;
      }
      if (market.dayNotionalVolumeUsd < minVolumeUsd) {
        return false;
      }
      return true;
    });

    const sortedMarkets = [...filteredMarkets].sort((a, b) => {
      switch (sortKey) {
        case 'funding':
          return Math.abs(b.fundingRateAnnualized) - Math.abs(a.fundingRateAnnualized);
        case 'liquidity':
          return b.openInterestUsd - a.openInterestUsd;
        case 'volume':
          return b.dayNotionalVolumeUsd - a.dayNotionalVolumeUsd;
        case 'score':
        default:
          return b.opportunityScore - a.opportunityScore;
      }
    });

    const topMarkets = sortedMarkets.slice(0, limit);

    const averageFundingAnnualized =
      filteredMarkets.length > 0
        ? filteredMarkets.reduce((sum, market) => sum + market.fundingRateAnnualized, 0) / filteredMarkets.length
        : 0;

    const averageAbsoluteFundingAnnualized =
      filteredMarkets.length > 0
        ? filteredMarkets.reduce((sum, market) => sum + Math.abs(market.fundingRateAnnualized), 0) / filteredMarkets.length
        : 0;

    res.json({
      success: true,
      data: {
        fetchedAt: new Date().toISOString(),
        filters: {
          limit,
          minOpenInterestUsd,
          minVolumeUsd,
          notionalUsd,
          direction: directionFilter,
          sort: sortKey,
        },
        totals: {
          availableMarkets: markets.length,
          filteredMarkets: filteredMarkets.length,
          averageFundingAnnualized,
          averageAbsoluteFundingAnnualized,
        },
        markets: topMarkets,
      },
    });
  } catch (error) {
    console.error('Error fetching Hyperliquid opportunities:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while fetching opportunities',
    });
  }
});

export default router;
