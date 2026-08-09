import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { licenseStatus } from '../services/license.js';
/**
 * About page — sab se pehle customer ko dikhne wala page.
 *
 * Do tarah ki info merge hoti hai:
 *   1. License se (read-only) — customer_name, expiry, days_left, state
 *   2. Settings se (admin-editable) — welcome_message, plan, email,
 *      start_date, support_contact, custom_message
 */
export const aboutRouter = Router();
const DEFAULTS = {
    about_welcome_message: 'Welcome, {name}!',
    about_customer_email: '',
    about_subscription_plan: 'Yearly',
    about_start_date: '',
    about_support_phone: '',
    about_support_email: '',
    about_custom_message: 'Your account is active. You can access all features and manage your data.',
    about_shop_name: 'Danish Cattle Feed',
};
/** Settings table se specific keys read karne ke liye helper */
function readSettings(keys) {
    const placeholders = keys.map(() => '?').join(',');
    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).all(...keys);
    const obj = {};
    for (const k of keys) {
        const found = rows.find(r => r.key === k);
        obj[k] = found?.value ?? DEFAULTS[k] ?? '';
    }
    return obj;
}
/** GET /api/about — koi bhi authenticated user dekh sakta hai */
aboutRouter.get('/', requireAuth, (_req, res) => {
    const keys = Object.keys(DEFAULTS);
    const settings = readSettings(keys);
    // License se live data
    const lic = licenseStatus(true); // force-refresh
    // welcome_message mein {name} placeholder replace karo
    const name = lic.customer_name ?? 'User';
    const welcomeTemplate = settings.about_welcome_message ?? DEFAULTS.about_welcome_message ?? 'Welcome, {name}!';
    const welcomeMessage = welcomeTemplate.replace(/\{name\}/g, name);
    // Start date: agar admin ne set ki hai toh woh, warna khali
    const startDate = settings.about_start_date ?? '';
    res.json({
        // License-derived (read-only)
        customer_name: lic.customer_name,
        licensed_until: lic.licensed_until,
        licensed_from: lic.licensed_from,
        days_left: lic.days_left,
        state: lic.state,
        machine_id: lic.machine_id,
        // Admin-editable
        welcome_message: welcomeMessage,
        customer_email: settings.about_customer_email,
        subscription_plan: settings.about_subscription_plan,
        start_date: settings.about_start_date,
        support_phone: settings.about_support_phone,
        support_email: settings.about_support_email,
        custom_message: settings.about_custom_message,
        shop_name: settings.about_shop_name,
    });
});
const aboutUpdateSchema = z.object({
    about_welcome_message: z.string().max(200).optional(),
    about_customer_email: z.string().max(200).optional(),
    about_subscription_plan: z.string().max(50).optional(),
    about_start_date: z.string().max(20).optional(),
    about_support_phone: z.string().max(50).optional(),
    about_support_email: z.string().max(200).optional(),
    about_custom_message: z.string().max(500).optional(),
    about_shop_name: z.string().max(100).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'Kuch update nahi hai.' });
/** PUT /api/about — sirf admin edit kar sakta hai */
aboutRouter.put('/', requireAuth, requireAdmin, (req, res) => {
    const parsed = aboutUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
    }
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
        for (const [key, value] of Object.entries(parsed.data)) {
            upsert.run(key, value);
        }
    })();
    res.json({ ok: true });
});
//# sourceMappingURL=about.js.map