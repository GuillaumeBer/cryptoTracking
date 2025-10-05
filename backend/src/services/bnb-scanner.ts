import { ethers } from 'ethers';
import axios from 'axios';
import { priceService } from './price-api';

interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  balance: number;
  priceUsd: number;
  valueUsd: number;
}

// ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

export class BNBScannerService {
  private provider: ethers.JsonRpcProvider;
  private bscScanApiKey: string;

  // Known token contracts from user's BNB Chain wallet (fallback if BSCScan doesn't find them)
  private readonly KNOWN_BNB_TOKENS = [
    '0x000ae314e2a2172a039b26378814c252734f556a', // ASTER (correct contract)
    '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
    '0x55d398326f99059fF775485246999027B3197955', // USDT
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  ];

  constructor() {
    this.provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
    this.bscScanApiKey = process.env.BSCSCAN_API_KEY || 'YourApiKeyToken'; // Free tier works
  }

  /**
   * Get all ERC20 token addresses for a wallet using BSCScan API
   */
  async getAllTokenAddresses(walletAddress: string): Promise<string[]> {
    try {
      const url = `https://api.bscscan.com/api?module=account&action=tokentx&address=${walletAddress}&startblock=0&endblock=999999999&sort=asc&apikey=${this.bscScanApiKey}`;

      console.log(`🔎 Calling BSCScan API for token transactions...`);
      const response = await axios.get(url);

      console.log(`📥 BSCScan API response status: ${response.data.status}, message: ${response.data.message}`);
      console.log(`📊 Number of transactions returned: ${response.data.result?.length || 0}`);

      // BSCScan can return status "0" with error message or valid results
      // Check if result is an array (valid data) or string (error message)
      if (response.data.result && Array.isArray(response.data.result)) {
        // Extract unique token contract addresses
        const tokenAddresses = new Set<string>();
        response.data.result.forEach((tx: any) => {
          if (tx.contractAddress) {
            tokenAddresses.add(tx.contractAddress);
          }
        });

        console.log(`✅ Found ${tokenAddresses.size} unique token contracts from BSCScan`);
        return Array.from(tokenAddresses);
      }

      console.log(`⚠️ BSCScan returned no valid token transactions: ${typeof response.data.result === 'string' ? response.data.result : 'Invalid data format'}`);
      return [];
    } catch (error: any) {
      console.error('❌ Error fetching token addresses from BSCScan:', error.message);
      return [];
    }
  }

  /**
   * Get token metadata and balance
   */
  async getTokenInfo(tokenAddress: string, walletAddress: string): Promise<TokenBalance | null> {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));

      console.log(`  Token ${symbol} (${tokenAddress.slice(0, 10)}...): balance = ${balanceFormatted.toFixed(6)}`);

      if (balanceFormatted < 0.0001) {
        return null; // Skip dust balances
      }

      return {
        address: tokenAddress,
        symbol,
        decimals: Number(decimals), // Convert BigInt to number
        balance: balanceFormatted,
        priceUsd: 0, // Will be filled by price oracle
        valueUsd: 0,
      };
    } catch (error: any) {
      console.log(`  ❌ Failed to query token ${tokenAddress.slice(0, 10)}...: ${error.message}`);
      return null;
    }
  }

  /**
   * Get USD prices using centralized price service
   * Automatically uses Binance first, then CoinGecko, with intelligent caching and rate limiting
   */
  async enrichWithPrices(tokens: TokenBalance[]): Promise<TokenBalance[]> {
    // Filter out native token (already has price)
    const erc20Tokens = tokens.filter(t => t.address !== 'native');

    if (erc20Tokens.length === 0) {
      return tokens;
    }

    console.log(`Fetching prices for ${erc20Tokens.length} tokens...`);

    // Step 1: Try to get prices by symbol first (faster, uses Binance)
    const symbolPrices = await priceService.getTokenPrices(
      erc20Tokens.map(t => t.symbol)
    );

    // Step 2: For tokens where symbol lookup failed, try contract address (uses CoinGecko)
    const tokensNeedingContractLookup: TokenBalance[] = [];

    for (const token of erc20Tokens) {
      const priceResult = symbolPrices[token.symbol];

      if (priceResult && priceResult.source !== 'default') {
        token.priceUsd = priceResult.price;
        token.valueUsd = token.balance * token.priceUsd;
        console.log(`  ${token.symbol} price: $${token.priceUsd.toFixed(4)} (${priceResult.source}) -> $${token.valueUsd.toFixed(2)}`);
      } else {
        tokensNeedingContractLookup.push(token);
      }
    }

    // Step 3: Fetch prices by contract address for remaining tokens
    if (tokensNeedingContractLookup.length > 0) {
      console.log(`  🔍 ${tokensNeedingContractLookup.length} tokens need contract address lookup...`);

      const contractPrices = await priceService.getTokenPricesByContract(
        'binance-smart-chain',
        tokensNeedingContractLookup.map(t => t.address)
      );

      for (const token of tokensNeedingContractLookup) {
        const priceResult = contractPrices[token.address];

        if (priceResult) {
          token.priceUsd = priceResult.price;
          token.valueUsd = token.balance * token.priceUsd;
          console.log(`  ${token.symbol} price: $${token.priceUsd.toFixed(4)} (${priceResult.source}) -> $${token.valueUsd.toFixed(2)}`);
        } else {
          console.log(`  ⚠️ No price found for ${token.symbol}`);
        }
      }
    }

    return tokens;
  }

  /**
   * Get native BNB balance and price
   */
  async getNativeBNBBalance(walletAddress: string): Promise<TokenBalance> {
    const balance = await this.provider.getBalance(walletAddress);
    const balanceFormatted = parseFloat(ethers.formatEther(balance));

    // Get BNB price using centralized price service
    const priceResult = await priceService.getTokenPrice('BNB');
    const bnbPrice = priceResult.price;

    console.log(`BNB price: $${bnbPrice.toFixed(2)} (${priceResult.source})`);

    return {
      address: 'native',
      symbol: 'BNB',
      decimals: 18,
      balance: balanceFormatted,
      priceUsd: bnbPrice,
      valueUsd: balanceFormatted * bnbPrice,
    };
  }

  /**
   * Scan wallet and return all tokens with USD values > minValue
   */
  async scanWallet(walletAddress: string, minValueUsd: number = 10): Promise<TokenBalance[]> {
    console.log(`\n🔍 Scanning BNB Chain wallet: ${walletAddress}`);
    console.log(`Minimum value filter: $${minValueUsd}`);

    // Get native BNB
    const bnbBalance = await this.getNativeBNBBalance(walletAddress);
    const allTokens: TokenBalance[] = [bnbBalance];

    console.log(`✅ BNB Balance: ${bnbBalance.balance.toFixed(4)} ($${bnbBalance.valueUsd.toFixed(2)})`);

    // Get all token addresses from BSCScan
    const bscscanTokens = await this.getAllTokenAddresses(walletAddress);

    // Hybrid approach: Combine BSCScan results with known tokens
    const allTokenAddresses = new Set<string>([...bscscanTokens, ...this.KNOWN_BNB_TOKENS]);

    console.log(`📋 Total token addresses to check: ${allTokenAddresses.size} (${bscscanTokens.length} from BSCScan + ${this.KNOWN_BNB_TOKENS.length} known tokens)`);

    if (allTokenAddresses.size === 0) {
      console.log('No tokens to check');
      return allTokens.filter(t => t.valueUsd >= minValueUsd);
    }

    console.log(`Fetching balances for ${allTokenAddresses.size} tokens...`);

    const tokenAddressArray = Array.from(allTokenAddresses);

    // Fetch balances in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < tokenAddressArray.length; i += batchSize) {
      const batch = tokenAddressArray.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(addr => this.getTokenInfo(addr, walletAddress))
      );

      batchResults.forEach(token => {
        if (token) {
          allTokens.push(token);
        }
      });

      // Small delay to avoid rate limits
      if (i + batchSize < tokenAddressArray.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Found ${allTokens.length - 1} tokens with non-zero balances`);

    // Enrich with prices
    console.log('Fetching USD prices from CoinGecko...');
    await this.enrichWithPrices(allTokens);

    // Filter by minimum value
    const filteredTokens = allTokens
      .filter(t => t.valueUsd >= minValueUsd)
      .sort((a, b) => b.valueUsd - a.valueUsd);

    console.log(`\n📊 Tokens above $${minValueUsd}:`);
    filteredTokens.forEach(token => {
      console.log(`  ${token.symbol}: ${token.balance.toFixed(4)} ($${token.valueUsd.toFixed(2)})`);
    });

    const totalValue = filteredTokens.reduce((sum, t) => sum + t.valueUsd, 0);
    console.log(`\n💰 Total value: $${totalValue.toFixed(2)}`);

    return filteredTokens;
  }
}

// Export singleton
let scannerInstance: BNBScannerService | null = null;

export const bnbScanner = {
  getInstance(): BNBScannerService {
    if (!scannerInstance) {
      scannerInstance = new BNBScannerService();
    }
    return scannerInstance;
  },

  async scanWallet(walletAddress: string, minValueUsd: number = 10) {
    return this.getInstance().scanWallet(walletAddress, minValueUsd);
  },
};
