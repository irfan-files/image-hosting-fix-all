import { Router, Request, Response } from 'express';
import { db } from '../db/database';

export const statsRouter = Router();

// GET /api/stats - Dashboard storage metrics
statsRouter.get('/', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_admin';
  const stats = db.getStorageStats(userId);
  return res.json({ stats });
});

// GET /api/settings - App settings
statsRouter.get('/settings', (req: Request, res: Response) => {
  const settings = db.getSettings();
  return res.json({ settings });
});

// PATCH /api/settings - Update app settings
statsRouter.patch('/settings', (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body);
  return res.json({ settings: updated });
});
