import { PerpConnector, PerpConnectorContext, PerpConnectorRegistry, PerpConnectorResult } from '../../types/perp';
import asterConnector from './aster';
import avantisConnector from './avantis';
import jupiterConnector from './jupiter';
import synfuturesConnector from './synfutures';
import { getConnectorResultWithCache } from './cache';

const registry: PerpConnectorRegistry = {
  [asterConnector.meta.id]: asterConnector,
  [avantisConnector.meta.id]: avantisConnector,
  [jupiterConnector.meta.id]: jupiterConnector,
  [synfuturesConnector.meta.id]: synfuturesConnector,
};

export function listPerpConnectors(): PerpConnector[] {
  return Object.values(registry);
}

export function getPerpConnector(id: string): PerpConnector | undefined {
  return registry[id];
}

export async function fetchAllPerpMarkets(ctx?: PerpConnectorContext): Promise<PerpConnectorResult[]> {
  const connectors = listPerpConnectors();
  const results: PerpConnectorResult[] = [];
  for (const connector of connectors) {
    try {
      const result = await getConnectorResultWithCache(connector, ctx);
      results.push(result);
    } catch (error) {
      results.push({
        meta: connector.meta,
        markets: [],
        lastUpdated: new Date().toISOString(),
        source: 'mock',
      });
      console.warn(`Connector "${connector.meta.id}" failed to fetch markets:`, (error as Error).message);
    }
  }
  return results;
}
