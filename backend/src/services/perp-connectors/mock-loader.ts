import fs from 'fs';
import path from 'path';
import { PerpConnectorId, PerpMarketData, PerpDepthLevel } from '../../types/perp';

interface RawMockMarket {
  symbol: string;
  markPrice: number;
  fundingRateHourly: number;
  fundingRateAnnualized: number;
  openInterestUsd: number;
  takerFeeBps: number;
  makerFeeBps: number;
  minQty: number;
  depthTop5?: Array<{ side: 'bid' | 'ask'; price: number; size: number }>;
  [key: string]: unknown;
}

interface RawMockVenue {
  status: string;
  markets: RawMockMarket[];
  [key: string]: unknown;
}

interface RawMockFeed {
  generatedAt: string;
  schemaVersion: string;
  venues: Record<string, RawMockVenue>;
}

const DEFAULT_MOCK_PATH = path.resolve(process.cwd(), 'mocks', 'perp_feeds', 'sample_feeds.json');

let cachedFeed: { data: RawMockFeed; mtimeMs: number } | null = null;

function readMockFeedFile(): RawMockFeed {
  const customPath = process.env.PERP_MOCK_PATH;
  const filePath = customPath ? path.resolve(process.cwd(), customPath) : DEFAULT_MOCK_PATH;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Perp mock feed not found at ${filePath}. Set PERP_MOCK_PATH or generate mock data.`);
  }

  const stats = fs.statSync(filePath);
  if (cachedFeed && cachedFeed.mtimeMs === stats.mtimeMs) {
    return cachedFeed.data;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as RawMockFeed;
  cachedFeed = { data, mtimeMs: stats.mtimeMs };
  return data;
}

function normaliseDepthLevels(levels: RawMockMarket['depthTop5']): PerpDepthLevel[] {
  if (!Array.isArray(levels)) {
    return [];
  }
  return levels
    .filter((level): level is { side: 'bid' | 'ask'; price: number; size: number } => {
      return level !== undefined && (level.side === 'bid' || level.side === 'ask');
    })
    .map(level => ({
      side: level.side,
      price: Number(level.price),
      size: Number(level.size),
    }));
}

function normaliseMarket(raw: RawMockMarket): PerpMarketData {
  const {
    symbol,
    markPrice,
    fundingRateHourly,
    fundingRateAnnualized,
    openInterestUsd,
    takerFeeBps,
    makerFeeBps,
    minQty,
    depthTop5,
    ...rest
  } = raw;

  const extra = Object.keys(rest).length > 0 ? rest : undefined;

  return {
    symbol,
    markPrice: Number(markPrice),
    fundingRateHourly: Number(fundingRateHourly),
    fundingRateAnnualized: Number(fundingRateAnnualized),
    openInterestUsd: Number(openInterestUsd),
    takerFeeBps: Number(takerFeeBps),
    makerFeeBps: Number(makerFeeBps),
    minQty: Number(minQty),
    depthTop5: normaliseDepthLevels(depthTop5),
    extra,
  };
}

export function getMockMarkets(connectorId: PerpConnectorId): { generatedAt: string; markets: PerpMarketData[] } {
  const feed = readMockFeedFile();
  const venue = feed.venues[connectorId];

  if (!venue) {
    throw new Error(`Mock feed missing venue "${connectorId}"`);
  }

  const markets = (venue.markets ?? []).map(normaliseMarket);
  return {
    generatedAt: feed.generatedAt,
    markets,
  };
}
