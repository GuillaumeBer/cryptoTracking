import axios from 'axios';
import { PerpConnector, PerpConnectorContext, PerpConnectorResult } from '../../types/perp';
import { getMockMarkets } from './mock-loader';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL ?? 'https://fapi.asterdex.com';
const ASTER_MAX_MARKETS = Number(process.env.ASTER_MAX_MARKETS ?? '12');
const ASTER_DEPTH_LIMIT = Number(process.env.ASTER_DEPTH_LIMIT ?? '5');

const formatSymbol = (symbol: string, baseAsset?: string, quoteAsset?: string): string => {
  if (baseAsset && quoteAsset) {
    return `${baseAsset}-${quoteAsset}`;
  }

  const knownQuotes = ['USDT', 'USDC', 'USD', 'PERP'];
  for (const quote of knownQuotes) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      const base = symbol.slice(0, symbol.length - quote.length);
      return `${base}-${quote}`;
    }
  }

  return symbol;
};

async function fetchLiveMarkets(): Promise<PerpConnectorResult> {
  const apiKey = process.env.ASTER_API_KEY;
  const secretKey = process.env.ASTER_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('Aster API credentials are missing. Set ASTER_API_KEY and ASTER_SECRET_KEY.');
  }

  try {
    const headers = {
      'X-API-KEY': apiKey,
      'X-API-SECRET': secretKey,
    };

    const [premiumRes, exchangeRes] = await Promise.all([
      axios.get(`${ASTER_BASE_URL}/fapi/v1/premiumIndex`, {
        headers,
        timeout: 10_000,
      }),
      axios.get(`${ASTER_BASE_URL}/fapi/v1/exchangeInfo`, {
        headers,
        timeout: 10_000,
      }),
    ]);

    const premiumData = Array.isArray(premiumRes.data) ? premiumRes.data : [];
    const exchangeSymbols = Array.isArray(exchangeRes.data?.symbols) ? exchangeRes.data.symbols : [];

    const symbolMap = new Map<string, any>();
    for (const info of exchangeSymbols) {
      if (info?.symbol) {
        symbolMap.set(info.symbol, info);
      }
    }

    const markets = await Promise.all(
      premiumData.slice(0, ASTER_MAX_MARKETS).map(async (item: any) => {
        const symbol = String(item?.symbol ?? '');
        const markPrice = Number(item?.markPrice ?? 0);
        const lastFundingRate = Number(item?.lastFundingRate ?? 0);
        const hourlyFunding = lastFundingRate / 8;
        const annualizedFunding = lastFundingRate * 3 * 365;

        const symbolInfo = symbolMap.get(symbol);
        const displaySymbol = formatSymbol(symbol, symbolInfo?.baseAsset, symbolInfo?.quoteAsset);

        // min quantity from LOT_SIZE filter
        let minQty = 0;
        if (Array.isArray(symbolInfo?.filters)) {
          const lotFilter = symbolInfo.filters.find((filter: any) => filter?.filterType === 'LOT_SIZE');
          if (lotFilter?.minQty) {
            minQty = Number(lotFilter.minQty);
          }
        }

        // open interest
        let openInterestUsd = 0;
        try {
          const oiResp = await axios.get(`${ASTER_BASE_URL}/fapi/v1/openInterest`, {
            headers,
            params: { symbol },
            timeout: 5_000,
          });
          const openInterest = Number(oiResp.data?.openInterest ?? 0);
          openInterestUsd = openInterest * markPrice;
        } catch (error) {
          openInterestUsd = 0;
        }

        // order book depth
        let depthTop5: Array<{ side: 'bid' | 'ask'; price: number; size: number }> = [];
        try {
          const depthResp = await axios.get(`${ASTER_BASE_URL}/fapi/v1/depth`, {
            headers,
            params: { symbol, limit: ASTER_DEPTH_LIMIT },
            timeout: 5_000,
          });
          const bids = Array.isArray(depthResp.data?.bids) ? depthResp.data.bids : [];
          const asks = Array.isArray(depthResp.data?.asks) ? depthResp.data.asks : [];
          depthTop5 = [
            ...bids.slice(0, ASTER_DEPTH_LIMIT).map((bid: any) => ({
              side: 'bid' as const,
              price: Number(bid[0]),
              size: Number(bid[1]),
            })),
            ...asks.slice(0, ASTER_DEPTH_LIMIT).map((ask: any) => ({
              side: 'ask' as const,
              price: Number(ask[0]),
              size: Number(ask[1]),
            })),
          ];
        } catch (error) {
          depthTop5 = [];
        }

        let takerFeeBps = 0;
        let makerFeeBps = 0;
        if (symbolInfo?.takerCommission !== undefined) {
          takerFeeBps = Number(symbolInfo.takerCommission) * 10_000;
        }
        if (symbolInfo?.makerCommission !== undefined) {
          makerFeeBps = Number(symbolInfo.makerCommission) * 10_000;
        }

        return {
          symbol: displaySymbol,
          markPrice,
          fundingRateHourly: hourlyFunding,
          fundingRateAnnualized: annualizedFunding,
          openInterestUsd,
          takerFeeBps,
          makerFeeBps,
          minQty,
          depthTop5,
          extra: {
            indexPrice: Number(item?.indexPrice ?? 0),
            nextFundingTime: item?.nextFundingTime ?? null,
          },
        };
      })
    );

    return {
      meta: asterConnector.meta,
      markets,
      lastUpdated: new Date().toISOString(),
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
    const preferLive = ctx?.preferLive ?? false;

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
      if (preferLive) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      console.warn('[Perp][Aster] Falling back to mock data:', (error as Error).message);
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
