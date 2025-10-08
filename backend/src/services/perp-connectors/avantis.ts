import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const DEFAULT_AVANTIS_GRAPHQL_URL = 'https://api.avantisfi.com/graphql';

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  const endpoint = process.env.AVANTIS_GRAPHQL_URL ?? DEFAULT_AVANTIS_GRAPHQL_URL;

  const query = `
    query PerpConnectorMarkets {
      perpMarkets {
        symbol
        markPrice
        fundingRateHourly
        fundingRateAnnualized
        openInterestUsd
        takerFeeBps
        makerFeeBps
        minQty
        depthTop5 {
          side
          price
          size
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      endpoint,
      { query },
      {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.AVANTIS_API_KEY ? { 'X-API-KEY': process.env.AVANTIS_API_KEY } : {}),
        },
      },
    );

    const markets = response.data?.data?.perpMarkets ?? [];

    return {
      meta: avantisConnector.meta,
      markets,
      lastUpdated: new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    throw new Error(`Failed to fetch Avantis markets: ${(error as Error).message}`);
  }
}

const avantisConnector: PerpConnector = {
  meta: {
    id: 'avantis',
    name: 'Avantis',
    description: 'Base-native perpetuals with synthetic markets and fee-sharing vaults.',
    website: 'https://www.avantisfi.com/',
    docs: 'https://sdk.avantisfi.com/',
    requiresApiKey: false,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;
    if (useMock) {
      const mock = getMockMarkets('avantis');
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
      const mock = getMockMarkets('avantis');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default avantisConnector;
