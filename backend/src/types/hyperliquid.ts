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
