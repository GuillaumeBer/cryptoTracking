import express, { Request, Response } from 'express';
import { fetchAllPerpMarkets, listPerpConnectors } from '../services/perp-connectors';
import { PerpConnectorContext } from '../types/perp';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const modeParam = typeof req.query.mode === 'string' ? req.query.mode.toLowerCase() : 'auto';

  let ctx: PerpConnectorContext | undefined;
  if (modeParam === 'mock') {
    ctx = { useMockData: true };
  } else if (modeParam === 'live') {
    ctx = { useMockData: false };
  }

  try {
    const results = await fetchAllPerpMarkets(ctx);

    const summary = results.map(result => ({
      id: result.meta.id,
      name: result.meta.name,
      requiresApiKey: result.meta.requiresApiKey,
      lastUpdated: result.lastUpdated,
      marketCount: result.markets.length,
      source: result.source,
    }));

    res.json({
      mode: modeParam,
      connectors: results,
      summary,
      availableConnectors: listPerpConnectors().map(connector => connector.meta),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
