/**
 * Unified Price Service
 *
 * Centralizes all price API calls to prevent rate limiting issues.
 * Smart orchestration between Binance and CoinGecko APIs.
 *
 * Features:
 * - Automatic fallback from Binance to CoinGecko
 * - Intelligent caching with configurable TTL
 * - Rate limiting for both APIs
 * - Batch request optimization
 * - Fallback to static prices when all APIs fail
 */

import { binancePriceService } from './binance-prices';
import { coinGeckoService } from './coingecko';
import { dexScreenerService } from './dexscreener';

// Map token symbols to Binance trading pairs (preferred for better rate limits)
const BINANCE_SYMBOL_MAP: { [key: string]: string } = {
  'USDC': 'USDCUSDT',
  'USDC.e': 'USDCUSDT',
  'USDCn': 'USDCUSDT',
  'USDT': 'USDTUSD',
  'DAI': 'DAIUSDT',
  'WETH': 'ETHUSDT',
  'ETH': 'ETHUSDT',
  'WBTC': 'BTCUSDT',
  'BTC': 'BTCUSDT',
  'WMATIC': 'MATICUSDT',
  'MATIC': 'MATICUSDT',
  'AAVE': 'AAVEUSDT',
  'LINK': 'LINKUSDT',
  'ARB': 'ARBUSDT',
  'AVAX': 'AVAXUSDT',
  'WAVAX': 'AVAXUSDT',
  'BNB': 'BNBUSDT',
  'WBNB': 'BNBUSDT',
  'SOL': 'SOLUSDT',
  'CAKE': 'CAKEUSDT',
  'UNI': 'UNIUSDT',
  'SUSHI': 'SUSHIUSDT',
  // Cosmos ecosystem
  'ATOM': 'ATOMUSDT',
  'OSMO': 'OSMOUSDT',
  'TIA': 'TIAUSDT',
  'INJ': 'INJUSDT',
  // Sui ecosystem
  'SUI': 'SUIUSDT',
};

// Map token symbols to CoinGecko IDs (fallback for tokens not on Binance)
const COINGECKO_SYMBOL_MAP: { [key: string]: string } = {
  'weETH': 'wrapped-eeth',
  'wstETH': 'wrapped-steth',
  'sAVAX': 'benqi-liquid-staked-avax',
  'S': 'sonic-3',
  'wS': 'sonic-3',
  'SONIC': 'sonic-3',
  'ASTER': 'aster',
};

// Fallback prices when all APIs fail (updated periodically)
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
  'BTC': 97000,
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
  'SOL': 190,
  'CAKE': 2.5,
  'UNI': 12,
  'SUSHI': 1.2,
  'ASTER': 0.08,
};

export interface PriceResult {
  price: number;
  source: 'binance' | 'coingecko' | 'dexscreener' | 'fallback' | 'default' | 'not-found';
}

/**
 * Unified Price Service
 * Smart orchestration between Binance and CoinGecko with automatic fallbacks
 */
class PriceService {
  private static instance: PriceService;

  private constructor() {
    console.log('✅ Unified Price Service initialized');
  }

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /**
   * Get USD price for a single token symbol
   * Tries Binance first, falls back to CoinGecko, then static fallback
   */
  async getTokenPrice(symbol: string): Promise<PriceResult> {
    // Try Binance first (better rate limits)
    const binanceSymbol = BINANCE_SYMBOL_MAP[symbol];
    if (binanceSymbol) {
      const binancePrice = await binancePriceService.getPrice(binanceSymbol);
      if (binancePrice !== null) {
        return { price: binancePrice, source: 'binance' };
      }
    }

    // Try alternative Binance lookup
    const tokenPrice = await binancePriceService.getTokenUsdPrice(symbol);
    if (tokenPrice !== null) {
      return { price: tokenPrice, source: 'binance' };
    }

    // Fall back to CoinGecko
    const coinGeckoId = COINGECKO_SYMBOL_MAP[symbol];
    if (coinGeckoId) {
      const coinGeckoPrice = await coinGeckoService.getCoinPrice(coinGeckoId);
      if (coinGeckoPrice !== null) {
        return { price: coinGeckoPrice, source: 'coingecko' };
      }
    }

    // Use fallback price
    if (FALLBACK_PRICES[symbol]) {
      return { price: FALLBACK_PRICES[symbol], source: 'fallback' };
    }

    // Default to $1 as last resort
    return { price: 1, source: 'default' };
  }

  /**
   * Get USD prices for multiple token symbols (batched and optimized)
   * @param symbols - Array of token symbols
   */
  async getTokenPrices(symbols: string[]): Promise<{ [symbol: string]: PriceResult }> {
    const results: { [symbol: string]: PriceResult } = {};
    const binanceSymbols: string[] = [];
    const binanceMap: { [binanceSymbol: string]: string } = {};
    const coinGeckoSymbols: string[] = [];

    // Categorize symbols
    for (const symbol of symbols) {
      const binanceSymbol = BINANCE_SYMBOL_MAP[symbol];
      if (binanceSymbol) {
        binanceSymbols.push(symbol);
        binanceMap[symbol] = binanceSymbol;
      } else if (COINGECKO_SYMBOL_MAP[symbol]) {
        coinGeckoSymbols.push(symbol);
      }
    }

    // Fetch Binance prices in batch (single API call)
    if (binanceSymbols.length > 0) {
      const binancePrices = await binancePriceService.getTokenUsdPrices(binanceSymbols);
      for (const symbol of binanceSymbols) {
        if (binancePrices[symbol] !== undefined) {
          results[symbol] = { price: binancePrices[symbol], source: 'binance' };
        }
      }
    }

    // Fetch CoinGecko prices in batch
    if (coinGeckoSymbols.length > 0) {
      const coinGeckoIds = coinGeckoSymbols.map(s => COINGECKO_SYMBOL_MAP[s]).filter(Boolean);
      const coinGeckoPrices = await coinGeckoService.getCoinPrices(coinGeckoIds);

      for (const symbol of coinGeckoSymbols) {
        const coinGeckoId = COINGECKO_SYMBOL_MAP[symbol];
        if (coinGeckoId && coinGeckoPrices[coinGeckoId] !== undefined) {
          results[symbol] = { price: coinGeckoPrices[coinGeckoId], source: 'coingecko' };
        }
      }
    }

    // Fill in missing prices with fallbacks
    for (const symbol of symbols) {
      if (!results[symbol]) {
        if (FALLBACK_PRICES[symbol]) {
          results[symbol] = { price: FALLBACK_PRICES[symbol], source: 'fallback' };
        } else {
          results[symbol] = { price: 1, source: 'default' };
        }
      }
    }

    return results;
  }

  /**
   * Get price for a token by contract address on a specific blockchain
   * Only uses CoinGecko as Binance doesn't support contract address lookups
   * @param platform - Blockchain platform (e.g., 'binance-smart-chain', 'ethereum')
   * @param contractAddress - Token contract address
   */
  async getTokenPriceByContract(
    platform: string,
    contractAddress: string
  ): Promise<PriceResult> {
    const price = await coinGeckoService.getTokenPrice(platform, contractAddress);

    if (price !== null) {
      return { price, source: 'coingecko' };
    }

    // No fallback for unknown contracts
    return { price: 1, source: 'default' };
  }

  /**
   * Get prices for multiple tokens by contract addresses (batched)
   * @param platform - Blockchain platform
   * @param contractAddresses - Array of contract addresses
   */
  async getTokenPricesByContract(
    platform: string,
    contractAddresses: string[]
  ): Promise<{ [address: string]: PriceResult }> {
    const results: { [address: string]: PriceResult } = {};

    // For Solana, try DexScreener first (better coverage for meme coins)
    if (platform === 'solana') {
      const dexPrices = await dexScreenerService.getTokenPrices(contractAddresses);

      for (const address of contractAddresses) {
        const lowerAddress = address.toLowerCase();
        if (dexPrices[lowerAddress] !== undefined) {
          results[address] = { price: dexPrices[lowerAddress], source: 'dexscreener' };
        }
      }

      // For tokens not found on DexScreener, try CoinGecko
      const notFound = contractAddresses.filter(addr => !results[addr]);
      if (notFound.length > 0) {
        const coinGeckoPrices = await coinGeckoService.getTokenPrices(platform, notFound);
        for (const address of notFound) {
          if (coinGeckoPrices[address.toLowerCase()] !== undefined) {
            results[address] = { price: coinGeckoPrices[address.toLowerCase()], source: 'coingecko' };
          } else {
            results[address] = { price: 0, source: 'not-found' };
          }
        }
      }
    } else {
      // For other chains, use CoinGecko
      const prices = await coinGeckoService.getTokenPrices(platform, contractAddresses);

      for (const address of contractAddresses) {
        if (prices[address.toLowerCase()] !== undefined) {
          results[address] = { price: prices[address.toLowerCase()], source: 'coingecko' };
        } else {
          results[address] = { price: 0, source: 'not-found' };
        }
      }
    }

    return results;
  }

  /**
   * Clear all caches (both Binance and CoinGecko)
   */
  clearAllCaches(): void {
    binancePriceService.clearCache();
    coinGeckoService.clearCache();
    console.log('🗑️ All price caches cleared');
  }

  /**
   * Get comprehensive cache statistics
   */
  getCacheStats(): {
    binance: { individualPrices: number; allPricesCached: boolean; allPricesCount: number };
    coingecko: { size: number; keys: string[] };
  } {
    return {
      binance: binancePriceService.getCacheStats(),
      coingecko: coinGeckoService.getCacheStats(),
    };
  }
}

// Export singleton instance and individual services
export const priceService = PriceService.getInstance();
export { binancePriceService, coinGeckoService };
