import express, { Express } from 'express';
import request from 'supertest';
import perpConnectorsRouter from '../perp-connectors';

const app: Express = express();
app.use('/perp-connectors', perpConnectorsRouter);

describe('Perp Connectors Route', () => {
  it('should return connector data in mock mode', async () => {
    const response = await request(app).get('/perp-connectors?mode=mock');

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('mock');
    expect(Array.isArray(response.body.connectors)).toBe(true);
    expect(Array.isArray(response.body.summary)).toBe(true);
    expect(response.body.connectors.length).toBeGreaterThan(0);
  });

  it('should default to auto mode when mode not provided', async () => {
    const response = await request(app).get('/perp-connectors');

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('auto');
    expect(Array.isArray(response.body.summary)).toBe(true);
  });
});
