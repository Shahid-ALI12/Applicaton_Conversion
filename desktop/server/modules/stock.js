import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getStockBalance } from '../services/stock.js';
export const stockRouter = Router();
// GET / - All stock balances
stockRouter.get('/', requireAuth, (_req, res) => {
    const balances = getStockBalance();
    res.json(balances);
});
// GET /:productId - Stock for a specific product across all locations
stockRouter.get('/:productId', requireAuth, (req, res) => {
    const productId = Number(req.params.productId);
    if (isNaN(productId))
        throw new Error('Invalid product ID');
    const summary = getStockBalance(productId);
    res.json(summary);
});
//# sourceMappingURL=stock.js.map