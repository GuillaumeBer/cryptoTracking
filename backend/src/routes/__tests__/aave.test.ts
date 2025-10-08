import express, { Express } from 'express';
import request from 'supertest';
import aaveRouter from '../aave'; // The router we're testing
import { priceService } from '../../services/price-api';

type FetchRequestInfo = Parameters<typeof fetch>[0];
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

const originalFetch = global.fetch;
const mockedFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
let priceSpy: jest.SpyInstance;

const jsonResponse = (
  body: unknown,
  init?: { ok?: boolean; status?: number; statusText?: string }
): FetchResponse =>
  ({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: async () => body,
  }) as FetchResponse;

const resolveUrl = (input: FetchRequestInfo): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof (input as any).url === 'string') return (input as any).url;
  return String(input);
};

// Create a test Express app
const app: Express = express();
app.use('/aave', aaveRouter);

describe('AAVE Route', () => {
  beforeAll(() => {
    process.env.GRAPH_API_KEY = 'test-key';
    global.fetch = mockedFetch;
  });

  afterAll(() => {
    delete process.env.GRAPH_API_KEY;
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    priceSpy = jest.spyOn(priceService, 'getTokenPrices').mockResolvedValue({
      WETH: { price: 3300, source: 'default' },
      USDC: { price: 1, source: 'default' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockReset();
    priceSpy.mockRestore();
  });

  it('should return a 400 error if wallet address is not provided', async () => {
    const response = await request(app).get('/aave');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Wallet address is required');
  });

  it('should return successfully with empty positions if the address has no AAVE data', async () => {
    // Mock the GraphQL response for all subgraphs
    mockedFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ data: { userReserves: [] } }))
    );

    const address = '0x1234567890123456789012345678901234567890';
    const response = await request(app).get(`/aave?address=${address}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Check that all chains have empty positions
    for (const chain in response.body.data) {
      expect(response.body.data[chain].positions).toEqual([]);
    }
  });

  it('should handle GraphQL errors gracefully', async () => {
    // Mock a GraphQL error response
    mockedFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ errors: [{ message: 'Something went wrong' }] }))
    );

    const address = '0x1234567890123456789012345678901234567890';
    const response = await request(app).get(`/aave?address=${address}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // We expect empty positions because the fetch should fail gracefully
    for (const chain in response.body.data) {
      expect(response.body.data[chain].positions).toEqual([]);
    }
  });

  it('should process and return AAVE positions correctly', async () => {
    const mockUserReserves = [
      {
        // Collateral
        currentVariableDebt: '0',
        currentStableDebt: '0',
        currentTotalDebt: '0',
        principalStableDebt: '0',
        scaledVariableDebt: '0',
        stableBorrowRate: '0',
        liquidityRate: '0',
        usageAsCollateralEnabledOnUser: true,
        currentATokenBalance: '1000000000000000000', // 1 WETH
        reserve: {
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          reserveLiquidationThreshold: '8500',
          baseLTVasCollateral: '8250',
          variableBorrowRate: '25000000000000000000000000', // 2.5%
        },
      },
      {
        // Borrow
        currentVariableDebt: '500000000', // 500 USDC
        currentStableDebt: '0',
        currentTotalDebt: '500000000',
        principalStableDebt: '0',
        scaledVariableDebt: '500000000',
        stableBorrowRate: '0',
        liquidityRate: '0',
        usageAsCollateralEnabledOnUser: false,
        currentATokenBalance: '0',
        reserve: {
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          reserveLiquidationThreshold: '9000',
          baseLTVasCollateral: '8700',
          variableBorrowRate: '50000000000000000000000000', // 5%
        },
      },
    ];

    mockedFetch.mockImplementation((input: FetchRequestInfo) => {
      const url = resolveUrl(input);
      if (url.includes('binance')) {
        return Promise.resolve(
          jsonResponse([
            { symbol: 'ETHUSDT', price: '3300' },
            { symbol: 'USDCUSDT', price: '1.0' },
          ])
        );
      }
      if (url.includes('arbitrum')) {
        return Promise.resolve(
          jsonResponse({ data: { userReserves: mockUserReserves } })
        );
      }
      // Fallback for other chains -> empty reserves
      return Promise.resolve(
        jsonResponse({ data: { userReserves: [] } })
      );
      });

    const address = '0x1234567890123456789012345678901234567890';
    const response = await request(app).get(`/aave?address=${address}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const arbitrumPositions = response.body.data.arbitrum.positions;
    expect(arbitrumPositions).toHaveLength(1);

    const position = arbitrumPositions[0];
    expect(position.asset).toBe('USDC');
    expect(position.borrowAmountUsd).toBeCloseTo(500);
    expect(position.collateralAmountUsd).toBeCloseTo(3300);
    expect(position.liquidationThreshold).toBeCloseTo(0.85, 2);
  });
});
