import express, { Express } from 'express';
import request from 'supertest';
import perpConnectorsRouter from '../perp-connectors';
import { fetchAllPerpMarkets, listPerpConnectors } from '../../services/perp-connectors';

jest.mock('../../services/perp-connectors', () => {
  const mockConnector = {
    meta: {
      id: 'avantis',
      name: 'Avantis',
      description: 'Test connector',
      requiresApiKey: false,
    },
    fetchMarkets: jest.fn(),
  };

  return {
    fetchAllPerpMarkets: jest.fn().mockResolvedValue([
      {
        meta: mockConnector.meta,
        markets: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        source: 'mock',
      },
    ]),
    listPerpConnectors: jest.fn().mockReturnValue([mockConnector]),
  };
});

const mockedFetchAllPerpMarkets = fetchAllPerpMarkets as jest.Mock;
const mockedListPerpConnectors = listPerpConnectors as jest.Mock;

const app: Express = express();
app.use('/perp-connectors', perpConnectorsRouter);

describe('Perp Connectors Route', () => {
  beforeEach(() => {
    mockedFetchAllPerpMarkets.mockClear();
    mockedListPerpConnectors.mockClear();
  });

  it('should return connector data in mock mode', async () => {
    mockedFetchAllPerpMarkets.mockResolvedValueOnce([
      {
        meta: {
          id: 'avantis',
          name: 'Avantis',
          description: 'Test connector',
          requiresApiKey: false,
        },
        markets: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        source: 'mock',
      },
    ]);

    const response = await request(app).get('/perp-connectors?mode=mock');

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('mock');
    expect(Array.isArray(response.body.connectors)).toBe(true);
    expect(Array.isArray(response.body.summary)).toBe(true);
    expect(response.body.connectors.length).toBeGreaterThan(0);
    expect(mockedFetchAllPerpMarkets).toHaveBeenCalledWith({
      useMockData: true,
      preferLive: false,
      mode: 'mock',
    });
    expect(mockedListPerpConnectors).toHaveBeenCalled();
  });

  it('should default to auto mode when mode not provided', async () => {
    mockedFetchAllPerpMarkets.mockResolvedValueOnce([
      {
        meta: {
          id: 'avantis',
          name: 'Avantis',
          description: 'Test connector',
          requiresApiKey: false,
        },
        markets: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        source: 'mock',
      },
    ]);

    const response = await request(app).get('/perp-connectors');

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('auto');
    expect(Array.isArray(response.body.summary)).toBe(true);
    expect(mockedFetchAllPerpMarkets).toHaveBeenCalledWith({ mode: 'auto', preferLive: false });
  });

  it('should request live mode with preferLive flag enabled', async () => {
    mockedFetchAllPerpMarkets.mockResolvedValueOnce([
      {
        meta: {
          id: 'avantis',
          name: 'Avantis',
          description: 'Test connector',
          requiresApiKey: false,
        },
        markets: [],
        lastUpdated: '2025-01-01T00:00:00Z',
        source: 'mock',
      },
    ]);

    const response = await request(app).get('/perp-connectors?mode=live');

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('live');
    expect(mockedFetchAllPerpMarkets).toHaveBeenCalledWith({
      useMockData: false,
      preferLive: true,
      mode: 'live',
    });
  });
});
