import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { paramInt } from '../utils/pagination.js';
import { getAllStockBalances, getProductStockSummary } from '../services/stock.js';

const router = Router();

// GET / - All stock balances
router.get('/', requireAuth, (_req: Request, res: Response, next: NextFunction) => {
  try {
    const balances = getAllStockBalances();
    res.json({ data: balances });
  } catch (err) {
    next(err);
  }
});

// GET /:productId - Stock for a specific product across all locations
router.get('/:productId', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = paramInt(req, 'productId');
    if (isNaN(productId)) {
      next(new Error('Invalid product ID'));
      return;
    }
    const summary = getProductStockSummary(productId);
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

export const stockRouter = router;
