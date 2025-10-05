import { ethers } from 'ethers';

interface ChainBalances {
  [coin: string]: number;
}

interface ChainConfig {
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
  chainId: number;
}

// ERC20 ABI - just the balanceOf function we need
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class AdditionalChainsService {
  private chains: ChainConfig[];

  constructor() {
    // Configure BNB Chain and Sonic with public RPC endpoints
    this.chains = [
      {
        name: 'BNB Chain',
        rpcUrl: 'https://bsc-dataseed1.binance.org',
        nativeSymbol: 'BNB',
        chainId: 56,
      },
      {
        name: 'Sonic',
        rpcUrl: 'https://rpc.soniclabs.com',
        nativeSymbol: 'S',
        chainId: 146,
      },
    ];
  }

  /**
   * Normalize token symbols to match Hyperliquid naming
   */
  private normalizeTokenSymbol(symbol: string): string {
    const symbolMap: { [key: string]: string } = {
      'WBNB': 'BNB',
      'WETH': 'ETH',
      'WBTC': 'BTC',
      'WMATIC': 'MATIC',
      'WAVAX': 'AVAX',
    };

    return symbolMap[symbol] || symbol;
  }

  /**
   * Fetch native balance for a chain
   */
  private async getNativeBalance(
    provider: ethers.JsonRpcProvider,
    address: string,
    chainConfig: ChainConfig
  ): Promise<number> {
    try {
      const balance = await provider.getBalance(address);
      const amount = parseFloat(ethers.formatEther(balance));

      if (amount > 0.0001) {
        console.log(`  ${chainConfig.name}: ${chainConfig.nativeSymbol} = ${amount.toFixed(6)}`);
        return amount;
      }
    } catch (error: any) {
      console.error(`Error fetching native balance on ${chainConfig.name}:`, error.message);
    }
    return 0;
  }

  /**
   * Fetch token balance for a specific token contract
   */
  private async getTokenBalance(
    provider: ethers.JsonRpcProvider,
    tokenAddress: string,
    walletAddress: string,
    chainName: string
  ): Promise<{ symbol: string; amount: number } | null> {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      // Fetch in parallel
      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      const amount = parseFloat(ethers.formatUnits(balance, decimals));

      if (amount > 0.0001) {
        const normalizedSymbol = this.normalizeTokenSymbol(symbol);
        console.log(`  ${chainName}: ${symbol} = ${amount.toFixed(6)}`);
        return { symbol: normalizedSymbol, amount };
      }
    } catch (error) {
      // Skip tokens that fail to fetch
    }
    return null;
  }

  /**
   * Fetch balances for a specific chain
   */
  private async getChainBalances(
    address: string,
    chainConfig: ChainConfig,
    knownTokens: string[]
  ): Promise<ChainBalances> {
    const balances: ChainBalances = {};

    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

      // Get native token balance
      const nativeAmount = await this.getNativeBalance(provider, address, chainConfig);
      if (nativeAmount > 0) {
        const normalizedSymbol = this.normalizeTokenSymbol(chainConfig.nativeSymbol);
        balances[normalizedSymbol] = nativeAmount;
      }

      // Fetch known token balances in parallel (check all known tokens)
      const tokenPromises = knownTokens.map((tokenAddress) =>
        this.getTokenBalance(provider, tokenAddress, address, chainConfig.name)
      );

      const tokenResults = await Promise.all(tokenPromises);

      tokenResults.forEach((result) => {
        if (result) {
          balances[result.symbol] = (balances[result.symbol] || 0) + result.amount;
        }
      });

      return balances;
    } catch (error: any) {
      console.error(`Error fetching ${chainConfig.name} balances:`, error.message);
      return {};
    }
  }

  /**
   * Get all balances from BNB Chain and Sonic
   */
  async getAllBalances(address: string): Promise<ChainBalances> {
    console.log(`\n🔗 Fetching balances from BNB Chain and Sonic...`);

    const allBalances: ChainBalances = {};

    // Known token contracts to check (user's specific tokens from screenshot)
    const bnbChainTokens = [
      // User's tokens from BNB Chain screenshot
      '0xD41FDb03Ba84762dD66a0af1a6C8540FF1ba5dfb', // ASTER
      '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
      '0x4FA7163E153419E0E1064e418dd7A99314Ed27b6', // XCV
      '0x9C65AB58d8d978DB963e63f2bfB7121627e3a739', // ACT
      '0x111111111117dC0aa78b770fA6A738034120C302', // MARCO
      '0x7b65B489fE53fCE1F6548Db886C08aD73111DDd8', // REVV
      '0x91F45aa2bDE7393e0AF1CC674FFE75d746b93567', // JGN
      '0xfCE68542D9ddB3Da2D03Cd88D2Bc6FaF6bFc5c8c', // ERA
      '0x5EFf0AB86090090d40a4AA0970BA332bb8c62b73', // DPET
      '0xc5A49b4CBe004b6FD55B30Ba1dE6AC360FF9765d', // RPG
      '0x19E6BfC1A6e4B042Fb20531244D47E252445df01', // MEMEBTC
      '0xA35923162C49cF95e6BF26623385eb431ad920D3', // Froyo
      '0x5d186E28934c6B0fF5Fc2feCE15D1F34f78cBd87', // PMON
      '0x4Bd17003473389A42DAF6a0a729f6Fdb328BbBd7', // vBSWAP

      // Common major tokens
      '0x55d398326f99059fF775485246999027B3197955', // USDT
      '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
      '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH
      '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    ];

    const sonicTokens: string[] = [
      // Add known Sonic token contracts here when available
    ];

    try {
      // Fetch from BNB Chain
      const bnbBalances = await this.getChainBalances(
        address,
        this.chains.find((c) => c.name === 'BNB Chain')!,
        bnbChainTokens
      );

      // Fetch from Sonic
      const sonicBalances = await this.getChainBalances(
        address,
        this.chains.find((c) => c.name === 'Sonic')!,
        sonicTokens
      );

      // Merge balances
      [bnbBalances, sonicBalances].forEach((chainBalances) => {
        Object.keys(chainBalances).forEach((symbol) => {
          allBalances[symbol] = (allBalances[symbol] || 0) + chainBalances[symbol];
        });
      });

      const assetCount = Object.keys(allBalances).length;
      console.log(`✅ Total assets found on BNB Chain + Sonic: ${assetCount}`);

      if (assetCount > 0) {
        console.log('📊 Additional chains balances summary:');
        Object.keys(allBalances)
          .sort()
          .forEach((symbol) => {
            if (allBalances[symbol] > 0.01) {
              console.log(`  ${symbol}: ${allBalances[symbol].toFixed(6)}`);
            }
          });
      }

      return allBalances;
    } catch (error: any) {
      console.error('Error fetching additional chains:', error.message);
      return {};
    }
  }

  isConfigured(): boolean {
    return true; // Always available with public RPCs
  }
}

// Singleton instance
let additionalChainsInstance: AdditionalChainsService | null = null;

export const additionalChainsService = {
  getInstance(): AdditionalChainsService {
    if (!additionalChainsInstance) {
      additionalChainsInstance = new AdditionalChainsService();
    }
    return additionalChainsInstance;
  },

  async getAllBalances(address: string) {
    return this.getInstance().getAllBalances(address);
  },

  isConfigured() {
    return this.getInstance().isConfigured();
  },
};
