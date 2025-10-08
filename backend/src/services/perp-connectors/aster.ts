import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const ASTER_BASE_URL = 'https://api.asterdex.com/v1';

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  const apiKey = process.env.ASTER_API_KEY;
  const secretKey = process.env.ASTER_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('Aster API credentials are missing. Set ASTER_API_KEY and ASTER_SECRET_KEY.');
  }

  try {
    const response = await axios.get(`${ASTER_BASE_URL}/perp/markets`, {
      headers: {
        'X-API-KEY': apiKey,
        'X-API-SECRET': secretKey,
      },
      timeout: 10_000,
    });

    const data = response.data as {
      generatedAt?: string;
      markets: Array<{
        symbol: string;
        markPrice: number;
        fundingRateHourly: number;
        fundingRateAnnualized: number;
        openInterestUsd: number;
        takerFeeBps: number;
        makerFeeBps: number;
        minQty: number;
        depthTop5: Array<{ side: 'bid' | 'ask'; price: number; size: number }>;
      }>;
    };

    return {
      meta: asterConnector.meta,
      markets: data.markets ?? [],
      lastUpdated: data.generatedAt ?? new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    // For now we surface the error and allow the caller to fallback to mock data.
    throw new Error(`Failed to fetch Aster markets: ${(error as Error).message}`);
  }
}

const asterConnector: PerpConnector = {
  meta: {
    id: 'aster',
    name: 'Aster',
    description: 'Centralized-orderbook style perp DEX on multiple chains with hidden order support.',
    website: 'https://www.asterdex.com/',
    docs: 'https://docs.asterdex.com/',
    requiresApiKey: true,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;

    if (useMock) {
      const mock = getMockMarkets('aster');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }

    try {
      return await fetchLiveMarkets();
    } catch (error) {
      const mock = getMockMarkets('aster');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default asterConnector;
