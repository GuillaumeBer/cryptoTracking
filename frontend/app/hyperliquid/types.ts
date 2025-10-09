export type OpportunityDirection = 'short' | 'long';
export type OpportunityDirectionFilter = OpportunityDirection | 'all';
export type OpportunitySort = 'score' | 'funding' | 'liquidity' | 'volume';
export type PerpConnectorMode = 'auto' | 'mock' | 'live';

export interface DeltaNeutralAction {
  action: 'buy' | 'sell' | 'increase_short' | 'decrease_short';
  amount: number;
  reason: string;
}

export interface FundingRateHistoryPoint {
  time: number;
  rate: number;
  rateApr: number;
}

export interface FundingRateData {
  currentRate: number;
  currentRateApr: number;
  nextFundingTime: number;
  avgRate7d: number;
  avgRate7dApr: number;
  history: FundingRateHistoryPoint[];
  estimatedDailyRevenue: number;
  estimatedMonthlyRevenue: number;
}

export interface HyperliquidPosition {
  coin: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  positionSize: number;
  positionValueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  leverage: number;
  distanceToLiquidation: number;
  distanceToLiquidationUsd: number;
  fundingPnl?: number;
  fundingPnlAllTime?: number;
  currentSessionFunding?: number;
  spotBalance?: number;
  isDeltaNeutral?: boolean;
  deltaImbalance?: number;
  deltaImbalanceValue?: number;
  deltaNeutralAction?: DeltaNeutralAction;
  hyperliquidFees?: number;
  hyperliquidFeesSinceChange?: number;
  binanceEquivalentFees?: number;
  binanceEquivalentFeesSinceChange?: number;
  totalFees?: number;
  futureClosingFees?: number;
  netGain?: number;
  netGainAdjusted?: number;
  netRevenueCurrent?: number;
  netRevenueAllTime?: number;
  tradeCount?: number;
  fundingRate?: FundingRateData;
  [key: string]: unknown;
}

export interface PerpMarketDepthLevel {
  side: 'bid' | 'ask';
  price: number;
  size: number;
}

export interface PerpMarketData {
  symbol: string;
  markPrice: number;
  fundingRateHourly: number;
  fundingRateAnnualized: number;
  openInterestUsd: number;
  takerFeeBps: number;
  makerFeeBps: number;
  minQty: number;
  depthTop5: PerpMarketDepthLevel[];
  extra?: Record<string, unknown>;
}

export interface PerpConnectorMeta {
  id: string;
  name: string;
  description: string;
  website?: string;
  docs?: string;
  requiresApiKey: boolean;
}

export interface PerpConnectorResult {
  meta: PerpConnectorMeta;
  markets: PerpMarketData[];
  lastUpdated: string;
  source: 'mock' | 'live';
}

export interface PerpConnectorSummary {
  id: string;
  name: string;
  requiresApiKey: boolean;
  lastUpdated: string;
  marketCount: number;
  source: 'mock' | 'live';
}

export interface HyperliquidOpportunity {
  coin: string;
  markPrice: number;
  oraclePrice: number | null;
  fundingRateHourly: number;
  fundingRateDaily: number;
  fundingRateAnnualized: number;
  openInterestBase: number;
  openInterestUsd: number;
  dayNotionalVolumeUsd: number;
  dayBaseVolume?: number;
  premium?: number | null;
  direction: OpportunityDirection;
  opportunityScore: number;
  liquidityScore: number;
  volumeScore: number;
  expectedDailyReturnPercent: number;
  estimatedDailyPnlUsd: number;
  estimatedMonthlyPnlUsd: number;
  notionalUsd: number;
  maxLeverage?: number;
  szDecimals?: number;
  onlyIsolated?: boolean;
  marginTableId?: number;
}

export interface HyperliquidOpportunityTotals {
  availableMarkets: number;
  filteredMarkets: number;
  averageFundingAnnualized: number;
  averageAbsoluteFundingAnnualized: number;
}

export interface HyperliquidOpportunityFilters {
  limit: number;
  minOpenInterestUsd: number;
  minVolumeUsd: number;
  direction: OpportunityDirectionFilter;
  sort: OpportunitySort;
  notionalUsd: number;
}

export interface HyperliquidOpportunityPayload {
  fetchedAt: string;
  filters: HyperliquidOpportunityFilters;
  totals: HyperliquidOpportunityTotals;
  markets: HyperliquidOpportunity[];
}

export interface HyperliquidOpportunityResponse {
  success: boolean;
  data?: HyperliquidOpportunityPayload;
  error?: string;
}
