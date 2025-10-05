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
} from '../types/hyperliquid';

const router = express.Router();

interface DeltaNeutralAction {
  action: 'buy' | 'sell' | 'increase_short' | 'decrease_short';
  amount: number;
  reason: string;
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
  fundingPnl?: number; // Total funding earned/paid
  spotBalance?: number; // Spot balance from wallet/binance
  isDeltaNeutral?: boolean; // Whether position is matched with spot
  deltaImbalance?: number; // Difference between short and spot
  deltaNeutralAction?: DeltaNeutralAction; // Recommendation to reach delta neutral
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

    // Fetch funding history
    const fundingResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'userFunding',
        user: address,
        startTime: 1704067200000, // Start of 2024
      }),
    });

    let totalFundingPnl = 0;
    const fundingByCoin: { [coin: string]: number } = {};

    if (fundingResponse.ok) {
      const fundingData = (await fundingResponse.json()) as HyperliquidFundingItem[];

      // Calculate total funding PnL per coin
      fundingData.forEach((item) => {
        if (item.delta.type === 'funding') {
          const coin = item.delta.coin;
          const fundingAmount = parseFloat(item.delta.usdc);

          if (!fundingByCoin[coin]) {
            fundingByCoin[coin] = 0;
          }
          fundingByCoin[coin] += fundingAmount;
          totalFundingPnl += fundingAmount;
        }
      });

      // Add funding PnL to positions
      shortPositions.forEach((position) => {
        position.fundingPnl = fundingByCoin[position.coin] || 0;
      });
    }

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

    // Fetch spot balances from Binance and merge
    if (binanceService.isConfigured()) {
      try {
        const binanceBalances = await binanceService.getSpotBalances();

        // Merge Binance balances with Hyperliquid balances
        Object.keys(binanceBalances).forEach((coin) => {
          if (spotBalances[coin]) {
            spotBalances[coin] += binanceBalances[coin];
          } else {
            spotBalances[coin] = binanceBalances[coin];
          }
        });

        console.log(`✅ Merged Binance balances with Hyperliquid balances`);
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
      bnbTokens.forEach((token) => {
        spotBalances[token.symbol] = (spotBalances[token.symbol] || 0) + token.balance;
      });

      console.log(`✅ Merged ${bnbTokens.length} tokens from BNB Chain (found: ${bnbTokens.map(t => t.symbol).join(', ')})`);
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

    // Match positions with spot balances for delta neutral detection
    shortPositions.forEach((position) => {
      const spotBalance = spotBalances[position.coin] || 0;
      position.spotBalance = spotBalance;

      const shortSize = Math.abs(position.positionSize);
      position.deltaImbalance = shortSize - spotBalance;

      // Consider delta neutral if difference is less than 5%
      const maxSize = Math.max(shortSize, spotBalance);
      const imbalancePercent = maxSize > 0 ? (Math.abs(position.deltaImbalance) / maxSize) * 100 : 0;
      position.isDeltaNeutral = maxSize > 0 && imbalancePercent < 5;

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
