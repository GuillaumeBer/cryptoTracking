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
  onchain: (address: string) => `${API_BASE_URL}/api/onchain?address=${address}`,
  bnbScan: (address: string) => `${API_BASE_URL}/api/bnb-scan?address=${address}`,
  prices: () => `${API_BASE_URL}/api/prices`,
  portfolio: () => `${API_BASE_URL}/api/portfolio`,
  perpConnectors: (mode: 'auto' | 'mock' | 'live' = 'auto') =>
    `${API_BASE_URL}/api/perp-connectors?mode=${mode}`,
};
