import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const SYNFUTURES_ENDPOINT = process.env.SYNFUTURES_REST_ENDPOINT ?? 'https://api.synfutures.com/v3/perp/markets';

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  try {
    const response = await axios.get(SYNFUTURES_ENDPOINT, { timeout: 10_000 });
    const markets = response.data?.markets ?? response.data ?? [];

    return {
      meta: synfuturesConnector.meta,
      markets,
      lastUpdated: new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    throw new Error(`Failed to fetch SynFutures markets: ${(error as Error).message}`);
  }
}

const synfuturesConnector: PerpConnector = {
  meta: {
    id: 'synfutures_v3',
    name: 'SynFutures v3',
    description: 'Permissionless perp markets supporting any asset pair with Pyth/Chainlink oracles.',
    website: 'https://www.synfutures.com/',
    docs: 'https://docs.synfutures.com/',
    requiresApiKey: false,
  },
  async fetchMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult> {
    const useMock = ctx?.useMockData ?? false;
    if (useMock) {
      const mock = getMockMarkets('synfutures_v3');
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
      const mock = getMockMarkets('synfutures_v3');
      return {
        meta: this.meta,
        markets: mock.markets,
        lastUpdated: mock.generatedAt,
        source: 'mock',
      };
    }
  },
};

export default synfuturesConnector;
