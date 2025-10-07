/**
 * Hyperliquid API Types
 */

export interface HyperliquidPositionData {
  coin: string;
  entryPx: string;
  szi: string;
  positionValue: string;
  unrealizedPnl: string;
  marginUsed: string;
  liquidationPx: string;
  leverage: {
    value: string;
  };
}

export interface HyperliquidAssetPosition {
  position: HyperliquidPositionData;
}

export interface HyperliquidClearinghouseState {
  assetPositions: HyperliquidAssetPosition[];
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
}

export interface HyperliquidPriceData {
  [coin: string]: string;
}

export interface HyperliquidSpotBalance {
  coin: string;
  total: string;
  hold: string;
}

export interface HyperliquidSpotState {
  balances: HyperliquidSpotBalance[];
}

export interface HyperliquidFundingDelta {
  type: string;
  coin: string;
  usdc: string;
  szi: string;
  fundingRate: string;
}

export interface HyperliquidFundingItem {
  time: number;
  delta: HyperliquidFundingDelta;
}

export interface HyperliquidUserFill {
  coin: string;
  px: string; // Price
  sz: string; // Size
  side: string; // A (ask) or B (bid)
  time: number; // Timestamp in milliseconds
  startPosition: string;
  dir: string; // e.g., "Open Short", "Close Long"
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string; // Fee in USDC
  tid: number;
  feeToken: string; // Usually "USDC"
  twapId: string | null;
  builderFee?: string; // Optional builder fee
}

/**
 * Funding Rate History Response
 */
export interface HyperliquidFundingHistoryItem {
  coin: string;
  fundingRate: string; // Funding rate as a decimal string (e.g., "0.0001" = 0.01%)
  premium: string;
  time: number; // Timestamp in milliseconds
}

/**
 * Meta and Asset Context Response (contains current funding rates)
 */
export interface HyperliquidAssetContext {
  funding: string; // Current funding rate
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: string[];
}

export interface HyperliquidUniverse {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

export interface HyperliquidMetaAndAssetCtxsItem {
  universe: HyperliquidUniverse[];
  assetCtxs: HyperliquidAssetContext[];
}

export type HyperliquidMetaAndAssetCtxs = HyperliquidMetaAndAssetCtxsItem[];
