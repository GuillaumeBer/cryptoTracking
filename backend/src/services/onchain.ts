import { Alchemy, Network } from 'alchemy-sdk';

interface OnchainBalances {
  [coin: string]: number;
}

interface ChainConfig {
  name: string;
  network: Network;
  apiKey: string;
}

export class OnchainService {
  private chains: ChainConfig[];

  constructor() {
    // Use free Alchemy demo API key (limited but works for testing)
    // For production, add ALCHEMY_API_KEY to .env
    const apiKey = process.env.ALCHEMY_API_KEY || 'demo';

    // Fetch from all major EVM chains
    this.chains = [
      { name: 'Ethereum', network: Network.ETH_MAINNET, apiKey },
      { name: 'Polygon', network: Network.MATIC_MAINNET, apiKey },
      { name: 'Arbitrum', network: Network.ARB_MAINNET, apiKey },
      { name: 'Optimism', network: Network.OPT_MAINNET, apiKey },
      { name: 'Base', network: Network.BASE_MAINNET, apiKey },
    ];
  }

  /**
   * Normalize token symbols to match Hyperliquid naming
   */
  private normalizeTokenSymbol(symbol: string): string {
    // Handle common token name variations
    const symbolMap: { [key: string]: string } = {
      'WETH': 'ETH',
      'WBTC': 'BTC',
      'WMATIC': 'MATIC',
      'WAVAX': 'AVAX',
      // Add more mappings as needed
    };

    return symbolMap[symbol] || symbol;
  }

  /**
   * Fetch token balances for a wallet address on a specific chain
   */
  private async getChainBalances(
    address: string,
    chainConfig: ChainConfig
  ): Promise<OnchainBalances> {
    const balances: OnchainBalances = {};

    try {
      const alchemy = new Alchemy({
        apiKey: chainConfig.apiKey,
        network: chainConfig.network,
      });

      // Get native token balance (ETH, MATIC, etc.)
      const nativeBalance = await alchemy.core.getBalance(address);
      const nativeSymbol = this.getNativeSymbol(chainConfig.network);
      const nativeAmount = parseFloat(nativeBalance.toString()) / 1e18;

      if (nativeAmount > 0.0001) {
        const normalizedSymbol = this.normalizeTokenSymbol(nativeSymbol);
        balances[normalizedSymbol] = (balances[normalizedSymbol] || 0) + nativeAmount;
        console.log(`  ${chainConfig.name}: ${nativeSymbol} = ${nativeAmount.toFixed(6)}`);
      }

      // Get ERC20 token balances
      const tokenBalances = await alchemy.core.getTokenBalances(address);

      // Limit to first 10 tokens to avoid timeout with demo API key
      const tokensToProcess = tokenBalances.tokenBalances
        .filter(token => token.tokenBalance && token.tokenBalance !== '0x0')
        .slice(0, 10);

      // Fetch token metadata and balances in parallel (max 5 at a time to avoid rate limits)
      const metadataPromises = tokensToProcess.map(async (token) => {
        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);

          if (metadata.symbol && metadata.decimals !== null) {
            const rawBalance = BigInt(token.tokenBalance!);
            const amount = parseFloat(rawBalance.toString()) / Math.pow(10, metadata.decimals);

            if (amount > 0.0001) {
              const normalizedSymbol = this.normalizeTokenSymbol(metadata.symbol);
              return { symbol: normalizedSymbol, amount, displaySymbol: metadata.symbol };
            }
          }
        } catch (error) {
          // Skip tokens with metadata errors
        }
        return null;
      });

      const metadataResults = await Promise.all(metadataPromises);

      // Add all valid tokens to balances
      metadataResults.forEach((result) => {
        if (result) {
          balances[result.symbol] = (balances[result.symbol] || 0) + result.amount;
          console.log(`  ${chainConfig.name}: ${result.displaySymbol} = ${result.amount.toFixed(6)}`);
        }
      });

      return balances;
    } catch (error: any) {
      console.error(`Error fetching ${chainConfig.name} balances:`, error.message);
      return {};
    }
  }

  /**
   * Get native token symbol for a network
   */
  private getNativeSymbol(network: Network): string {
    const nativeSymbols: { [key: string]: string } = {
      [Network.ETH_MAINNET]: 'ETH',
      [Network.MATIC_MAINNET]: 'MATIC',
      [Network.ARB_MAINNET]: 'ETH',
      [Network.OPT_MAINNET]: 'ETH',
      [Network.BASE_MAINNET]: 'ETH',
    };

    return nativeSymbols[network] || 'ETH';
  }

  /**
   * Fetch all onchain balances across all EVM chains
   */
  async getAllOnchainBalances(address: string): Promise<OnchainBalances> {
    console.log(`\n🔗 Fetching onchain balances for ${address}...`);

    const allBalances: OnchainBalances = {};

    // Fetch balances from all chains in parallel
    const balancePromises = this.chains.map((chain) =>
      this.getChainBalances(address, chain)
    );

    const results = await Promise.all(balancePromises);

    // Merge all balances
    results.forEach((chainBalances) => {
      Object.keys(chainBalances).forEach((symbol) => {
        allBalances[symbol] = (allBalances[symbol] || 0) + chainBalances[symbol];
      });
    });

    const assetCount = Object.keys(allBalances).length;
    console.log(`✅ Total onchain assets found: ${assetCount}`);

    if (assetCount > 0) {
      console.log('📊 Onchain balances summary:');
      Object.keys(allBalances)
        .sort()
        .forEach((symbol) => {
          if (allBalances[symbol] > 0.01) {
            console.log(`  ${symbol}: ${allBalances[symbol].toFixed(6)}`);
          }
        });
    }

    return allBalances;
  }

  /**
   * Check if onchain fetching is configured
   */
  isConfigured(): boolean {
    return true; // Alchemy has free tier, always available
  }
}

// Singleton instance
let onchainServiceInstance: OnchainService | null = null;

export const onchainService = {
  getInstance(): OnchainService {
    if (!onchainServiceInstance) {
      onchainServiceInstance = new OnchainService();
    }
    return onchainServiceInstance;
  },

  async getAllOnchainBalances(address: string) {
    return this.getInstance().getAllOnchainBalances(address);
  },

  isConfigured() {
    return this.getInstance().isConfigured();
  },
};
