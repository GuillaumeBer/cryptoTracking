import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const JUPITER_PERPS_ENDPOINT = process.env.JUPITER_PERPS_ENDPOINT ?? 'https://perps-api.jupiter.ag/v1/markets';

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  try {
    const response = await axios.get(JUPITER_PERPS_ENDPOINT, { timeout: 10_000 });
    const markets = response.data?.markets ?? response.data ?? [];

    return {
      meta: jupiterConnector.meta,
      markets,
      lastUpdated: new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    throw new Error(`Failed to fetch Jupiter markets: ${(error as Error).message}`);
  }
}

const jupiterConnector: PerpConnector = {
  meta: {
    id: 'jupiter_perps',
    name: 'Jupiter Perps',
    description: 'Solana-native perpetuals routed through the Jupiter aggregator.',
    website: 'https://jup.ag/',
    docs: 'https://station.jup.ag/docs/perps/overview',
    requiresApiKey: false,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;
    if (useMock) {
      const mock = getMockMarkets('jupiter_perps');
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
      const mock = getMockMarkets('jupiter_perps');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default jupiterConnector;
