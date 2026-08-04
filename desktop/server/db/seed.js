import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { logger } from '../logger.js';
export function runSeed() {
    // Admin user
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
        const hash = bcrypt.hashSync('admin123', 11);
        db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin', hash, 'admin');
        logger.info('Seeded admin user (admin/admin123)');
    }
    // Locations
    const locCount = db.prepare('SELECT COUNT(*) as c FROM locations').get().c;
    if (locCount === 0) {
        const insert = db.prepare('INSERT INTO locations (name) VALUES (?)');
        insert.run('Farm');
        insert.run('Shop');
        logger.info('Seeded locations');
    }
    // Cash accounts
    const cashCount = db.prepare('SELECT COUNT(*) as c FROM cash_accounts').get().c;
    if (cashCount === 0) {
        const insert = db.prepare('INSERT INTO cash_accounts (name) VALUES (?)');
        insert.run('Cash In Hand');
        insert.run('Cash In Locker');
        logger.info('Seeded cash accounts');
    }
    // Products
    const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (prodCount === 0) {
        const insert = db.prepare('INSERT INTO products (name, default_rate) VALUES (?, ?)');
        const products = [
            ['Wheat Bran (Choker)', 2200],
            ['Cotton Seed Cake (Khal Banola)', 5800],
            ['Maize Gluten (Ghalla)', 4600],
            ['Soya Bean Meal', 7200],
            ['Canola Meal', 5400],
            ['Rice Polish', 3200],
            ['DCP (Dicalcium Phosphate)', 12000],
            ['Salt (Namak)', 800],
        ];
        for (const [name, rate] of products)
            insert.run(name, rate);
        logger.info('Seeded products');
    }
    // Settings
    const setCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
    if (setCount === 0) {
        const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        insert.run('shop_name', 'Danish Cattle Feed');
        insert.run('support_phone', '');
        logger.info('Seeded settings');
    }
}
//# sourceMappingURL=seed.js.map