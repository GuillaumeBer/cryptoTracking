/**
 * API Configuration
 * Centralized configuration for all backend API endpoints
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const endpoints = {
  morpho: (address: string) => `${API_BASE_URL}/api/morpho?address=${address}`,
  aave: (address: string) => `${API_BASE_URL}/api/aave?address=${address}`,
  jupiter: (address: string) => `${API_BASE_URL}/api/jupiter?address=${address}`,
  hyperliquid: (address: string) => `${API_BASE_URL}/api/hyperliquid?address=${address}`,
  hyperliquidOpportunities: (params: {
    limit?: number;
    minOpenInterestUsd?: number;
    minVolumeUsd?: number;
    direction?: 'short' | 'long' | 'all';
    sort?: 'score' | 'funding' | 'liquidity' | 'volume';
    notionalUsd?: number;
    tradingCostDaily?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      searchParams.set(key, String(value));
    });
    const queryString = searchParams.toString();
    return `${API_BASE_URL}/api/hyperliquid/opportunities${queryString ? `?${queryString}` : ''}`;
  },
  hyperliquidRecommendation: (params: {
    address: string;
    candidates?: number;
    minOpenInterestUsd?: number;
    minVolumeUsd?: number;
    notionalUsd?: number;
    tradingCostDaily?: number;
    liquidityBufferPercent?: number;
    targetLeverage?: number;
    maxLeverage?: number;
    maxOiPercent?: number;
    maxVolumePercent?: number;
    liquidityUsd?: number;
  }) => {
    const { address, ...rest } = params;
    const searchParams = new URLSearchParams();

    Object.entries(rest).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      searchParams.set(key, String(value));
    });

    searchParams.set('address', address);

    const queryString = searchParams.toString();
    return `${API_BASE_URL}/api/hyperliquid/opportunities/recommendation${queryString ? `?${queryString}` : ''}`;
  },
  onchain: (address: string) => `${API_BASE_URL}/api/onchain?address=${address}`,
  bnbScan: (address: string) => `${API_BASE_URL}/api/bnb-scan?address=${address}`,
  prices: () => `${API_BASE_URL}/api/prices`,
  portfolio: () => `${API_BASE_URL}/api/portfolio`,
  perpConnectors: (mode: 'auto' | 'mock' | 'live' = 'auto') =>
    `${API_BASE_URL}/api/perp-connectors?mode=${mode}`,
};
