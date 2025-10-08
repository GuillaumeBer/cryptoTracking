import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';

interface CacheEntry {
  result: PerpConnectorResult;
  expiresAt: number;
}

const TTL_LIVE_MS = Number(process.env.PERP_CONNECTOR_LIVE_TTL_MS ?? 60_000);
const TTL_MOCK_MS = Number(process.env.PERP_CONNECTOR_MOCK_TTL_MS ?? 10_000);

const cache = new Map<string, CacheEntry>();

function getCacheKey(connectorId: string, ctx?: PerpConnectorContext): string {
  const mode = ctx?.useMockData ? 'mock' : 'auto';
  return `${connectorId}:${mode}`;
}

export async function getConnectorResultWithCache(
  connector: PerpConnector,
  ctx?: PerpConnectorContext,
): Promise<PerpConnectorResult> {
  const cacheKey = getCacheKey(connector.meta.id, ctx);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const result = await connector.fetchMarkets(ctx);

  const ttl = result.source === 'live' ? TTL_LIVE_MS : TTL_MOCK_MS;
  cache.set(cacheKey, {
    result,
    expiresAt: now + ttl,
  });

  return result;
}

export function clearConnectorCache(): void {
  cache.clear();
}
