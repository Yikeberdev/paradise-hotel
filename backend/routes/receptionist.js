const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

async function ensureSeenColumns() {
    const alters = [
        "ALTER TABLE payments ADD COLUMN receptionist_seen TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE room_reservations ADD COLUMN receptionist_seen TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE desk_reservations ADD COLUMN receptionist_seen TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE food_orders ADD COLUMN receptionist_seen TINYINT(1) NOT NULL DEFAULT 0",
    ];
    for (const sql of alters) {
        try { await db.execute(sql); } catch (_) { }
    }
}

let columnsReady = false;
async function ready() {
    if (!columnsReady) {
        await ensureSeenColumns();
        columnsReady = true;
    }
}

async function countUnseen(table) {
    try {
        const [rows] = await db.execute(
            `SELECT COUNT(*) AS c FROM ${table} WHERE IFNULL(receptionist_seen, 0) = 0`
        );
        return Number(rows[0]?.c || 0);
    } catch (e) {
        console.warn('countUnseen', table, e.message);
        return 0;
    }
}

/**
 * GET /api/receptionist/unread
 * Counts unseen payments, room reservations, desk reservations, food orders
 */
router.get('/unread', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await ready();
        const [payments, rooms, desks, food] = await Promise.all([
            countUnseen('payments'),
            countUnseen('room_reservations'),
            countUnseen('desk_reservations'),
            countUnseen('food_orders'),
        ]);
        const reservations = rooms + desks;
        const total = payments + rooms + desks + food;
        res.json({
            success: true,
            unread: {
                payments,
                rooms,
                desks,
                reservations,
                food,
                orders: food,
                total,
            },
        });
    } catch (error) {
        console.error('GET /receptionist/unread:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/receptionist/mark-seen
 * body: { type: 'payments' | 'rooms' | 'desks' | 'food' | 'reservations' | 'all', ids?: number[] }
 */
router.post('/mark-seen', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await ready();
        const type = String(req.body.type || 'all').toLowerCase();
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : null;

        const mark = async (table) => {
            if (ids && ids.length) {
                const placeholders = ids.map(() => '?').join(',');
                await db.execute(
                    `UPDATE ${table} SET receptionist_seen = 1 WHERE id IN (${placeholders})`,
                    ids
                );
            } else {
                await db.execute(`UPDATE ${table} SET receptionist_seen = 1 WHERE IFNULL(receptionist_seen, 0) = 0`);
            }
        };

        if (type === 'payments' || type === 'all') await mark('payments');
        if (type === 'rooms' || type === 'reservations' || type === 'all') await mark('room_reservations');
        if (type === 'desks' || type === 'reservations' || type === 'all') await mark('desk_reservations');
        if (type === 'food' || type === 'orders' || type === 'all') await mark('food_orders');

        const [payments, rooms, desks, food] = await Promise.all([
            countUnseen('payments'),
            countUnseen('room_reservations'),
            countUnseen('desk_reservations'),
            countUnseen('food_orders'),
        ]);
        res.json({
            success: true,
            message: 'Marked as seen',
            unread: {
                payments,
                rooms,
                desks,
                reservations: rooms + desks,
                food,
                orders: food,
                total: payments + rooms + desks + food,
            },
        });
    } catch (error) {
        console.error('POST /receptionist/mark-seen:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/receptionist/unread-items
 * Recent unseen rows for the Unread panel
 */
router.get('/unread-items', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await ready();
        const [payments] = await db.execute(
            `SELECT p.id, p.amount, p.status, p.payment_method, p.transaction_date, p.reservation_type,
                    COALESCE(c.first_name, u.first_name) AS first_name,
                    COALESCE(c.last_name, u.last_name) AS last_name
             FROM payments p
             LEFT JOIN customers c ON p.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE IFNULL(p.receptionist_seen, 0) = 0
             ORDER BY p.id DESC LIMIT 50`
        ).catch(() => [[]]);
        const [rooms] = await db.execute(
            `SELECT r.id, r.status, r.check_in_date, r.check_out_date, r.total_price,
                    COALESCE(c.first_name, u.first_name) AS first_name,
                    COALESCE(c.last_name, u.last_name) AS last_name,
                    rm.room_number
             FROM room_reservations r
             LEFT JOIN customers c ON r.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             LEFT JOIN rooms rm ON r.room_id = rm.id
             WHERE IFNULL(r.receptionist_seen, 0) = 0
             ORDER BY r.id DESC LIMIT 50`
        ).catch(() => [[]]);
        const [desks] = await db.execute(
            `SELECT d.id, d.status, d.reservation_date, d.start_time, d.end_time,
                    COALESCE(c.first_name, u.first_name) AS first_name,
                    COALESCE(c.last_name, u.last_name) AS last_name,
                    dk.desk_number
             FROM desk_reservations d
             LEFT JOIN customers c ON d.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             LEFT JOIN desks dk ON d.desk_id = dk.id
             WHERE IFNULL(d.receptionist_seen, 0) = 0
             ORDER BY d.id DESC LIMIT 50`
        ).catch(() => [[]]);
        const [food] = await db.execute(
            `SELECT o.id, o.status, o.total_amount, o.order_date,
                    COALESCE(c.first_name, u.first_name) AS first_name,
                    COALESCE(c.last_name, u.last_name) AS last_name
             FROM food_orders o
             LEFT JOIN customers c ON o.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE IFNULL(o.receptionist_seen, 0) = 0
             ORDER BY o.id DESC LIMIT 50`
        ).catch(() => [[]]);

        res.json({
            success: true,
            payments: payments || [],
            rooms: rooms || [],
            desks: desks || [],
            food: food || [],
        });
    } catch (error) {
        console.error('GET /receptionist/unread-items:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
