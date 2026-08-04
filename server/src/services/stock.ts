import { db } from '../db/connection.js';

export interface StockRow {
  product_id: number; product_name: string; location_id: number; location_name: string;
  stock_quantity: number; last_bag_weight_kg: number | null;
}

export function getStockBalance(productId?: number, locationId?: number): StockRow[] {
  let sql = `
    SELECT ps.product_id, p.name as product_name, ps.location_id, l.name as location_name,
           ps.stock_quantity, ps.last_bag_weight_kg
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    JOIN locations l ON l.id = ps.location_id
    WHERE 1=1
  `;
  const params: (number | string)[] = [];
  if (productId) { sql += ' AND ps.product_id = ?'; params.push(productId); }
  if (locationId) { sql += ' AND ps.location_id = ?'; params.push(locationId); }
  sql += ' ORDER BY p.name, l.name';
  return db.prepare(sql).all(...params) as StockRow[];
}

export function decrementStock(productId: number, locationId: number, qty: number, bagWeightKg?: number | null): void {
  // Ensure row exists
  db.prepare(`
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (?, ?, 0, NULL)
    ON CONFLICT (product_id, location_id) DO NOTHING
  `).run(productId, locationId);

  db.prepare(`
    UPDATE product_stock SET
      stock_quantity = stock_quantity - ?,
      last_bag_weight_kg = COALESCE(?, last_bag_weight_kg)
    WHERE product_id = ? AND location_id = ?
  `).run(qty, bagWeightKg ?? null, productId, locationId);
}

export function incrementStock(productId: number, locationId: number, qty: number, bagWeightKg?: number | null): void {
  db.prepare(`
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (product_id, location_id) DO UPDATE SET
      stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
      last_bag_weight_kg = COALESCE(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg)
  `).run(productId, locationId, qty, bagWeightKg ?? null);
}
