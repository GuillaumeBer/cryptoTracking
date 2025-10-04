import express, { Express } from 'express';
import request from 'supertest';
import aaveRouter from '../aave'; // The router we're testing
import fetch from 'node-fetch';

// Mock node-fetch
const { Response } = jest.requireActual('node-fetch');
jest.mock('node-fetch');

const mockedFetch = fetch as unknown as jest.Mock;

// Create a test Express app
const app: Express = express();
app.use('/aave', aaveRouter);

describe('AAVE Route', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a 400 error if wallet address is not provided', async () => {
    const response = await request(app).get('/aave');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Wallet address is required');
  });

  it('should return successfully with empty positions if the address has no AAVE data', async () => {
    // Mock the GraphQL response for all subgraphs
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { userReserves: [] } }))
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
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'Something went wrong' }] }))
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

    // Mock GraphQL response for Arbitrum only
    mockedFetch.mockImplementation((url: string) => {
      if (url.includes('arbitrum')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { userReserves: mockUserReserves } }))
        );
      }
      // Mock empty responses for other chains
      return Promise.resolve(
        new Response(JSON.stringify({ data: { userReserves: [] } }))
      );
    });

    // Mock price API responses
    mockedFetch.mockImplementation((url: string) => {
        if (url.includes('binance')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { symbol: 'ETHUSDT', price: '3300' },
                { symbol: 'USDCUSDT', price: '1.0' },
              ])
            )
          );
        }
        // Fallback for other fetches (subgraphs)
        return Promise.resolve(
          new Response(JSON.stringify({ data: { userReserves: url.includes('arbitrum') ? mockUserReserves : [] } }))
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
    expect(position.liquidationThreshold).toBe(0.9);
  });
});