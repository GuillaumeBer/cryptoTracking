// @ts-ignore - No types available for @binance/connector
import { Spot } from '@binance/connector';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface SpotBalances {
  [coin: string]: number;
}

/**
 * Normalize Binance asset names to match Hyperliquid naming
 * Removes "LD" prefix from Liquid Staking tokens
 */
function normalizeAssetName(binanceAsset: string): string {
  // Remove "LD" prefix for Liquid Staking tokens
  if (binanceAsset.startsWith('LD')) {
    return binanceAsset.substring(2);
  }

  // Handle special cases
  const assetMap: { [key: string]: string } = {
    'ASTR': 'ASTER',  // ASTR on Binance = ASTER on Hyperliquid
    // Add more mappings as needed
  };

  return assetMap[binanceAsset] || binanceAsset;
}

export class BinanceService {
  private client: any;
  private apiKey: string;
  private apiSecret: string;
  private privateKeyPath: string;
  private useHmac: boolean = false;

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.apiSecret = process.env.BINANCE_API_SECRET || '';
    this.privateKeyPath = process.env.BINANCE_PRIVATE_KEY_PATH || '';

    if (!this.apiKey) {
      console.warn('⚠️  BINANCE_API_KEY not configured in .env');
      return;
    }

    // Determine which authentication method to use
    this.useHmac = !!this.apiSecret;

    try {
      if (this.useHmac) {
        // HMAC-SHA256 authentication (standard mode with API Secret)
        this.client = new Spot(this.apiKey, this.apiSecret, {
          baseURL: 'https://api.binance.com',
        });
        console.log('✅ Binance client initialized with HMAC-SHA256 authentication');
      } else {
        // RSA/Ed25519 authentication (advanced mode with private key)
        if (!this.privateKeyPath) {
          console.warn('⚠️  Neither BINANCE_API_SECRET nor BINANCE_PRIVATE_KEY_PATH configured in .env');
          return;
        }

        const privateKeyFile = path.resolve(this.privateKeyPath);
        if (!fs.existsSync(privateKeyFile)) {
          console.warn(`⚠️  Private key file not found: ${privateKeyFile}`);
          return;
        }

        const privateKey = fs.readFileSync(privateKeyFile, 'utf-8');

        // Initialize Binance client with RSA/Ed25519 signature
        this.client = new Spot(this.apiKey, '', {
          baseURL: 'https://api.binance.com',
        });

        // Store private key for signing
        (this.client as any).privateKey = privateKey;

        console.log('✅ Binance client initialized with RSA/Ed25519 authentication');
      }
    } catch (error) {
      console.error('❌ Error initializing Binance client:', error);
    }
  }

  /**
   * Sign request using RSA or Ed25519 private key
   */
  private signRequest(queryString: string): string {
    if (!(this.client as any).privateKey) {
      throw new Error('Private key not loaded');
    }

    const privateKey = (this.client as any).privateKey;

    try {
      // Determine key type (RSA or Ed25519)
      const isEd25519 = privateKey.includes('BEGIN PRIVATE KEY') && privateKey.includes('Ed25519');

      const sign = crypto.createSign(isEd25519? 'sha256' : 'RSA-SHA256');
      sign.update(queryString);
      sign.end();

      const signature = sign.sign(privateKey, 'base64');
      return signature;
    } catch (error) {
      console.error('Error signing request:', error);
      throw error;
    }
  }

  /**
   * Fetch Simple Earn (Flexible + Locked) balances from Binance
   */
  async getEarnBalances(): Promise<SpotBalances> {
    if (!this.client) {
      return {};
    }

    const balances: SpotBalances = {};
    const detailedLog: string[] = [];

    try {
      // Fetch Flexible Earn products
      const flexibleResponse = await this.client.getFlexibleProductPosition();

      if (flexibleResponse.data && flexibleResponse.data.rows) {
        flexibleResponse.data.rows.forEach((position: any) => {
          const rawAsset = position.asset;
          const asset = normalizeAssetName(rawAsset);
          const amount = parseFloat(position.totalAmount || '0');
          if (amount > 0) {
            balances[asset] = (balances[asset] || 0) + amount;
            detailedLog.push(`  Flexible: ${rawAsset} → ${asset}: ${amount}`);
          }
        });
      }

      console.log(`✅ Fetched Flexible Earn: ${flexibleResponse.data?.rows?.length || 0} positions`);
    } catch (error: any) {
      console.error('Error fetching Flexible Earn balances:', error.response?.data || error.message);
    }

    try {
      // Fetch Locked Earn products
      const lockedResponse = await this.client.getLockedProductPosition();

      if (lockedResponse.data && lockedResponse.data.rows) {
        lockedResponse.data.rows.forEach((position: any) => {
          const rawAsset = position.asset;
          const asset = normalizeAssetName(rawAsset);
          const principal = parseFloat(position.amount || '0');
          const rewards = parseFloat(position.rewardAmt || '0');
          const totalAmount = principal + rewards;

          if (totalAmount > 0) {
            balances[asset] = (balances[asset] || 0) + totalAmount;
            detailedLog.push(`  Locked: ${rawAsset} → ${asset}: ${totalAmount} (principal: ${principal}, rewards: ${rewards})`);
          }
        });
      }

      console.log(`✅ Fetched Locked Earn: ${lockedResponse.data?.rows?.length || 0} positions`);
    } catch (error: any) {
      console.error('Error fetching Locked Earn balances:', error.response?.data || error.message);
    }

    // Log detailed balance breakdown
    if (detailedLog.length > 0) {
      console.log('📊 Earn Balances Breakdown:');
      detailedLog.forEach(log => console.log(log));
    }

    console.log(`✅ Total Earn balances: ${Object.keys(balances).length} unique assets`);
    return balances;
  }

  /**
   * Fetch ALL user assets using comprehensive endpoint
   * This should include Spot, Earn, Staking, etc.
   */
  async getUserAssets(): Promise<SpotBalances> {
    if (!this.client) {
      return {};
    }

    try {
      // Use the comprehensive user asset endpoint
      const response = await this.client.userAsset();

      const balances: SpotBalances = {};

      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((asset: any) => {
          const rawAssetName = asset.asset;
          const normalizedAsset = normalizeAssetName(rawAssetName);
          const free = parseFloat(asset.free || '0');
          const locked = parseFloat(asset.locked || '0');
          const freeze = parseFloat(asset.freeze || '0');
          const withdrawing = parseFloat(asset.withdrawing || '0');

          const total = free + locked + freeze + withdrawing;

          if (total > 0) {
            balances[normalizedAsset] = (balances[normalizedAsset] || 0) + total;
            console.log(`  ${rawAssetName} → ${normalizedAsset}: ${total} (free=${free}, locked=${locked}, freeze=${freeze})`);
          }
        });
      }

      console.log(`✅ Fetched comprehensive user assets: ${Object.keys(balances).length} assets`);
      return balances;
    } catch (error: any) {
      console.warn('⚠️  getUserAsset() not available, falling back to manual fetch');
      console.error('Error:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Fetch all balances from Binance (Spot + Earn)
   */
  async getAllBalances(): Promise<SpotBalances> {
    if (!this.client) {
      console.warn('Binance client not initialized, returning empty balances');
      return {};
    }

    const allBalances: SpotBalances = {};

    try {
      // 1. Fetch Spot balances
      let spotResponse;

      if (this.useHmac) {
        spotResponse = await this.client.account();
      } else {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = this.signRequest(queryString);

        spotResponse = await this.client.account({
          timestamp,
          signature,
        });
      }

      if (spotResponse.data && spotResponse.data.balances) {
        spotResponse.data.balances.forEach((balance: BinanceBalance) => {
          const total = parseFloat(balance.free) + parseFloat(balance.locked);
          if (total > 0) {
            const normalizedAsset = normalizeAssetName(balance.asset);
            allBalances[normalizedAsset] = (allBalances[normalizedAsset] || 0) + total;
          }
        });
      }

      console.log(`✅ Fetched ${Object.keys(allBalances).length} Binance spot balances (normalized)`);

      // 2. Fetch Earn balances and merge
      const earnBalances = await this.getEarnBalances();

      Object.keys(earnBalances).forEach((asset) => {
        const normalizedAsset = normalizeAssetName(asset);
        allBalances[normalizedAsset] = (allBalances[normalizedAsset] || 0) + earnBalances[asset];
      });

      console.log(`✅ Total Binance balances (Spot + Earn): ${Object.keys(allBalances).length} assets`);
      console.log('📊 Normalized balances:', Object.keys(allBalances).filter(k => allBalances[k] > 1).join(', '));
      return allBalances;
    } catch (error: any) {
      console.error('Error fetching Binance balances:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Fetch ONLY redeemable Flexible Earn balances
   * Excludes Spot wallet and Locked Earn products
   * Use this for assets that can be redeemed but are currently earning
   */
  async getRedeemableEarnBalances(): Promise<SpotBalances> {
    if (!this.client) {
      console.warn('Binance client not initialized, returning empty balances');
      return {};
    }

    const balances: SpotBalances = {};

    try {
      // Fetch ONLY Flexible Earn products (can be redeemed anytime)
      // Use size: 100 to get all positions in one call
      const flexibleResponse = await this.client.getFlexibleProductPosition({ size: 100 });

      if (flexibleResponse.data && flexibleResponse.data.rows) {
        flexibleResponse.data.rows.forEach((position: any) => {
          if (position.canRedeem) {
            const rawAsset = position.asset;
            const asset = normalizeAssetName(rawAsset);
            const amount = parseFloat(position.totalAmount || '0');
            if (amount > 0) {
              balances[asset] = (balances[asset] || 0) + amount;
            }
          }
        });
      }

      console.log(`✅ Fetched ${Object.keys(balances).length} redeemable Flexible Earn balances`);
      return balances;
    } catch (error: any) {
      console.error('Error fetching redeemable Earn balances:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Fetch ONLY spot wallet balances (excludes Earn products)
   * Use this for delta-neutral calculations where only liquid balances matter
   */
  async getSpotBalances(): Promise<SpotBalances> {
    if (!this.client) {
      console.warn('Binance client not initialized, returning empty balances');
      return {};
    }

    const spotBalances: SpotBalances = {};

    try {
      let spotResponse;

      if (this.useHmac) {
        spotResponse = await this.client.account();
      } else {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = this.signRequest(queryString);

        spotResponse = await this.client.account({
          timestamp,
          signature,
        });
      }

      if (spotResponse.data && spotResponse.data.balances) {
        spotResponse.data.balances.forEach((balance: BinanceBalance) => {
          const total = parseFloat(balance.free) + parseFloat(balance.locked);
          if (total > 0) {
            const normalizedAsset = normalizeAssetName(balance.asset);
            spotBalances[normalizedAsset] = (spotBalances[normalizedAsset] || 0) + total;
          }
        });
      }

      console.log(`✅ Fetched ${Object.keys(spotBalances).length} Binance SPOT-ONLY balances (excludes Earn)`);
      return spotBalances;
    } catch (error: any) {
      console.error('Error fetching Binance spot balances:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Check if Binance is configured
   */
  isConfigured(): boolean {
    return !!this.client && !!this.apiKey && (!!this.apiSecret || !!this.privateKeyPath);
  }
}

// Singleton instance - lazy initialization
let binanceServiceInstance: BinanceService | null = null;

export const binanceService = {
  getInstance(): BinanceService {
    if (!binanceServiceInstance) {
      binanceServiceInstance = new BinanceService();
    }
    return binanceServiceInstance;
  },

  // Proxy methods
  async getSpotBalances() {
    return this.getInstance().getSpotBalances();
  },

  async getAllBalances() {
    return this.getInstance().getAllBalances();
  },

  async getRedeemableEarnBalances() {
    return this.getInstance().getRedeemableEarnBalances();
  },

  isConfigured() {
    return this.getInstance().isConfigured();
  }
};
