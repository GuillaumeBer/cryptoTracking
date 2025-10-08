export type PerpConnectorId = 'aster' | 'avantis' | 'jupiter_perps' | 'synfutures_v3';

export interface PerpDepthLevel {
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
  depthTop5: PerpDepthLevel[];
  extra?: Record<string, unknown>;
}

export interface PerpConnectorMetadata {
  id: PerpConnectorId;
  name: string;
  description: string;
  website?: string;
  docs?: string;
  requiresApiKey: boolean;
}

export interface PerpConnectorContext {
  useMockData?: boolean;
}

export interface PerpConnectorResult {
  meta: PerpConnectorMetadata;
  markets: PerpMarketData[];
  lastUpdated: string;
  source: 'mock' | 'live';
}

export interface PerpConnector {
  meta: PerpConnectorMetadata;
  fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult>;
}

export interface PerpConnectorRegistry {
  [id: string]: PerpConnector;
}
