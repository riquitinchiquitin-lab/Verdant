import express from 'express';
import { BotanicalAggregatorService } from '../services/BotanicalAggregatorService';

export const createAggregatorRouter = (service: BotanicalAggregatorService = new BotanicalAggregatorService()) => {
  const router = express.Router();

  router.get('/species', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({ error: 'MISSING_QUERY_Q' });
      const result = await service.aggregateByName(q);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: 'AGGREGATOR_FAULT', message: e?.message });
    }
  });

  router.get('/species/:provider/:id', async (req, res) => {
    try {
      const { provider, id } = req.params;
      const result = await service.getByProviderId(provider, id);
      if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: 'PROVIDER_FAULT', message: e?.message });
    }
  });

  const requireImporterRole = (req: express.Request, res: express.Response): boolean => {
    const role = (req as any).userRole;
    if (role && !['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      res.status(403).json({ error: 'INSUFFICIENT_CLEARANCE' });
      return false;
    }
    return true;
  };

  router.post('/import/forestry', async (req, res) => {
    if (!requireImporterRole(req, res)) return;
    try {
      const count = await service.municipal.syncBulk(req.body);
      res.json({ imported: count });
    } catch (e: any) {
      res.status(500).json({ error: 'FORESTRY_IMPORT_FAULT', message: e?.message });
    }
  });

  router.post('/import/traits', async (req, res) => {
    if (!requireImporterRole(req, res)) return;
    try {
      const raw = typeof req.body === 'string' ? req.body : req.body?.data;
      const count = await service.bgciTry.syncBulk(raw);
      res.json({ imported: count });
    } catch (e: any) {
      res.status(500).json({ error: 'TRAIT_IMPORT_FAULT', message: e?.message });
    }
  });

  router.post('/import/dwca', async (req, res) => {
    if (!requireImporterRole(req, res)) return;
    try {
      const raw = typeof req.body === 'string' ? req.body : req.body?.data;
      const count = await service.vascan.syncBulk(raw);
      res.json({ imported: count });
    } catch (e: any) {
      res.status(500).json({ error: 'DWCA_IMPORT_FAULT', message: e?.message });
    }
  });

  router.get('/cache/stats', async (_req, res) => {
    const stats = await service.cache.stats();
    res.json(stats);
  });

  return router;
};
