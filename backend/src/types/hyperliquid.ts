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
