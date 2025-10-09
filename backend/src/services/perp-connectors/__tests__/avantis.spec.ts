jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../mock-loader', () => ({
  getMockMarkets: jest.fn(() => ({
    generatedAt: '2025-01-01T00:00:00Z',
    markets: [],
  })),
}));

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import avantisConnector, { buildDepthLevels, deriveFundingRates } from '../avantis';
import { getMockMarkets } from '../mock-loader';

const mockedAxiosGet = axios.get as jest.Mock;
const mockedGetMockMarkets = getMockMarkets as jest.Mock;

const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  mockedAxiosGet.mockReset();
  mockedGetMockMarkets.mockReset();
  consoleLogSpy.mockClear();
  consoleWarnSpy.mockClear();
});

afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('deriveFundingRates', () => {
  it('returns positive funding when long margin exceeds short margin', () => {
    const pair = {
      marginFee: { long: 0.0024, short: 0.0018 },
      openInterest: { long: 10_000_000, short: 9_000_000 },
    };

    const result = deriveFundingRates(pair);

    expect(result.fundingRateHourly).toBeCloseTo((0.0024 - 0.0018) / 24, 10);
    expect(result.fundingRateAnnualized).toBeCloseTo(result.fundingRateHourly * 24 * 365, 10);
  });

  it('uses open interest skew when margins are symmetric', () => {
    const pair = {
      marginFee: { long: 0.0015, short: 0.0015 },
      openInterest: { long: 15_000_000, short: 5_000_000 },
    };

    const result = deriveFundingRates(pair);
    const expectedHourly = (0.0015 / 24);

    expect(result.fundingRateHourly).toBeCloseTo(expectedHourly, 10);
    expect(result.fundingRateAnnualized).toBeCloseTo(expectedHourly * 24 * 365, 10);
  });

  it('returns zero when there is no margin delta or skew', () => {
    const pair = {
      marginFee: { long: 0.001, short: 0.001 },
      openInterest: { long: 12_000_000, short: 12_000_000 },
    };

    const result = deriveFundingRates(pair);

    expect(result.fundingRateHourly).toBe(0);
    expect(result.fundingRateAnnualized).toBe(0);
  });
});

describe('buildDepthLevels', () => {
  it('builds depth levels using the one percent depth bands', () => {
    const pair = {
      pairParams: {
        onePercentDepthBelow: 5_000,
        onePercentDepthAbove: 10_000,
      },
    };

    const markPrice = 100;
    const levels = buildDepthLevels(markPrice, pair);

    expect(levels).toHaveLength(6);

    const bidLevels = levels.filter(level => level.side === 'bid');
    const askLevels = levels.filter(level => level.side === 'ask');

    const bidTotalSize = bidLevels.reduce((sum, level) => sum + level.size, 0);
    const askTotalSize = askLevels.reduce((sum, level) => sum + level.size, 0);

    expect(bidLevels).toHaveLength(3);
    expect(askLevels).toHaveLength(3);
    expect(bidTotalSize * markPrice).toBeCloseTo(5_000, 6);
    expect(askTotalSize * markPrice).toBeCloseTo(10_000, 6);

    expect(bidLevels[0].price).toBeLessThan(markPrice);
    expect(askLevels[0].price).toBeGreaterThan(markPrice);
  });

  it('returns an empty array when mark price is not positive', () => {
    const pair = {
      pairParams: { onePercentDepthBelow: 5_000, onePercentDepthAbove: 10_000 },
    };

    expect(buildDepthLevels(0, pair)).toEqual([]);
    expect(buildDepthLevels(-10, pair)).toEqual([]);
  });
});

describe('avantisConnector.fetchMarkets', () => {
  it('returns live markets when socket and price endpoints succeed', async () => {
    const readFixture = (filename: string) => {
      const fixturePath = path.join(__dirname, '__fixtures__', filename);
      const raw = fs.readFileSync(fixturePath, 'utf-8');
      return JSON.parse(raw);
    };

    const socketPayload = readFixture('avantis-socket.json');
    const pricePayload = readFixture('pyth-price.json');

    mockedAxiosGet.mockResolvedValueOnce({ data: socketPayload });
    mockedAxiosGet.mockResolvedValueOnce({ data: pricePayload });

    const result = await avantisConnector.fetchMarkets({ useMockData: false });

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);

    const [socketCall] = mockedAxiosGet.mock.calls[0];
    expect(socketCall).toContain('socket-api');

    const [priceCall, priceParams] = mockedAxiosGet.mock.calls[1];
    expect(priceCall).toContain('hermes.pyth.network');
    expect(priceParams.params['ids[]']).toEqual(['feed1234']);

    expect(result.source).toBe('live');
    expect(result.markets).toHaveLength(1);

    const market = result.markets[0];
    expect(market.symbol).toBe('ETH-USD');
    expect(market.markPrice).toBeCloseTo(200, 8);
    expect(market.minQty).toBeCloseTo(50 / 200, 8);
    expect(market.fundingRateHourly).toBeCloseTo((0.001 - 0.0015) / 24, 10);
    expect(market.takerFeeBps).toBeCloseTo(0.0008 * 100, 10);
    expect(market.makerFeeBps).toBeCloseTo(0.0004 * 100, 10);
    expect(market.depthTop5).toHaveLength(6);
    expect(market.extra?.feedId).toBe('0xfeed1234');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Perp][Avantis] Live pull succeeded'));
  });

  it('falls back to mock data when live fetch fails', async () => {
    mockedAxiosGet.mockRejectedValueOnce(new Error('network down'));

    const mockMarkets = {
      generatedAt: '2024-01-01T00:00:00Z',
      markets: [
        {
          symbol: 'MOCK-USD',
          markPrice: 1,
          fundingRateHourly: 0,
          fundingRateAnnualized: 0,
          openInterestUsd: 0,
          takerFeeBps: 0,
          makerFeeBps: 0,
          minQty: 0,
          depthTop5: [],
        },
      ],
    };

    mockedGetMockMarkets.mockReturnValueOnce(mockMarkets);

    const result = await avantisConnector.fetchMarkets({ useMockData: false });

    expect(result.source).toBe('mock');
    expect(result.markets).toEqual(mockMarkets.markets);
    expect(mockedGetMockMarkets).toHaveBeenCalledWith('avantis');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Perp][Avantis] Falling back to mock data:',
      'Failed to fetch Avantis markets: network down',
    );
  });

  it('rethrows the live error when preferLive is requested', async () => {
    mockedAxiosGet.mockRejectedValueOnce(new Error('network down'));

    await expect(
      avantisConnector.fetchMarkets({ useMockData: false, preferLive: true }),
    ).rejects.toThrow('network down');

    expect(mockedGetMockMarkets).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
