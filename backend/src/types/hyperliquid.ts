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
  cumFunding?: {
    allTime?: string;
    sinceOpen?: string;
    sinceChange?: string;
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
  funding: string; // Current funding rate (hourly)
  openInterest: string;
  prevDayPx?: string | null;
  dayNtlVlm?: string;
  dayBaseVlm?: string;
  premium?: string | null;
  oraclePx?: string;
  markPx?: string;
  midPx?: string | null;
  impactPxs?: string[] | null;
}

export interface HyperliquidUniverse {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
  marginTableId?: number;
}

export interface HyperliquidMetaResponse {
  universe: HyperliquidUniverse[];
  marginTables?: Array<[number, Record<string, unknown>]>;
}

export type HyperliquidAssetContextsResponse = HyperliquidAssetContext[];

export type HyperliquidMetaAndAssetCtxs = [
  HyperliquidMetaResponse,
  HyperliquidAssetContextsResponse
];
