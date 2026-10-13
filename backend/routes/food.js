const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');
const { sendNotificationEmail } = require('../utils/email');
const { logAuditAction } = require('../utils/audit');
const { getActiveDiscounts, decorateItem, getDiscountedPrice } = require('../utils/discounts');



// Public: active discounts for customers (no auth required)
// Active when current datetime is within [start_date+start_time, end_date+end_time]
router.get('/discounts/active', async (req, res) => {
    try {
        // Ensure optional target_item_id column exists
        try {
            await db.execute('ALTER TABLE discounts ADD COLUMN target_item_id INT NULL');
        } catch (_) { }
        try {
            await db.execute('ALTER TABLE discounts ADD COLUMN target_item_name VARCHAR(150) NULL');
        } catch (_) { }

        let rows = [];
        try {
            const [r] = await db.execute(
                `SELECT d.*,
                        d.discount_percentage AS percentage,
                        d.discount_type AS type,
                        d.target_category AS category,
                        d.target_item_id,
                        d.target_item_name
                 FROM discounts d
                 WHERE TIMESTAMP(d.start_date, COALESCE(d.start_time, '00:00:00')) <= NOW()
                   AND TIMESTAMP(d.end_date, COALESCE(d.end_time, '23:59:59')) >= NOW()
                 ORDER BY d.id DESC`
            );
            rows = r;
        } catch (sqlErr) {
            console.warn('active discounts SQL window failed, using JS filter:', sqlErr.message);
            const [all] = await db.execute(
                `SELECT d.*, d.discount_percentage AS percentage, d.discount_type AS type,
                        d.target_category AS category FROM discounts d ORDER BY d.id DESC`
            );
            const now = Date.now();
            const toMs = (dateVal, timeVal, endOfDay) => {
                let ds = dateVal;
                if (ds instanceof Date) ds = ds.toISOString().slice(0, 10);
                else ds = String(ds || '').slice(0, 10);
                let ts = timeVal;
                if (ts instanceof Date) {
                    ts = ts.toISOString().slice(11, 19);
                } else {
                    ts = String(ts || (endOfDay ? '23:59:59' : '00:00:00'));
                    if (ts.length === 5) ts += ':00';
                    ts = ts.slice(0, 8);
                }
                const ms = Date.parse(`${ds}T${ts}`);
                return Number.isNaN(ms) ? (endOfDay ? Infinity : 0) : ms;
            };
            rows = (all || []).filter((d) => {
                const start = toMs(d.start_date, d.start_time, false);
                const end = toMs(d.end_date, d.end_time, true);
                return now >= start && now <= end;
            });
        }

        // Enrich with item prices
        for (const d of rows) {
            d.items = [];
            const pct = Number(d.discount_percentage || d.percentage || 0);
            try {
                if (d.discount_type === 'food') {
                    if (d.target_item_id) {
                        const [foods] = await db.execute(
                            `SELECT id, item_name, price, category FROM food_menu WHERE id = ? LIMIT 1`,
                            [d.target_item_id]
                        );
                        d.items = (foods || []).map((f) => ({
                            id: f.id,
                            name: f.item_name,
                            category: f.category,
                            normalPrice: Number(f.price),
                            discountedPrice: Number((Number(f.price) * (1 - pct / 100)).toFixed(2)),
                        }));
                    } else if (d.target_category) {
                        const [foods] = await db.execute(
                            `SELECT id, item_name, price, category FROM food_menu
                             WHERE category = ? AND availability = 'available' ORDER BY id DESC LIMIT 50`,
                            [d.target_category]
                        );
                        d.items = (foods || []).map((f) => ({
                            id: f.id,
                            name: f.item_name,
                            category: f.category,
                            normalPrice: Number(f.price),
                            discountedPrice: Number((Number(f.price) * (1 - pct / 100)).toFixed(2)),
                        }));
                    }
                } else if (d.discount_type === 'room' && d.target_item_id) {
                    const [rooms] = await db.execute(
                        `SELECT id, room_number, room_type, price_per_night AS price FROM rooms WHERE id = ? LIMIT 1`,
                        [d.target_item_id]
                    );
                    d.items = (rooms || []).map((r) => ({
                        id: r.id,
                        name: `Room ${r.room_number} (${r.room_type})`,
                        normalPrice: Number(r.price),
                        discountedPrice: Number((Number(r.price) * (1 - pct / 100)).toFixed(2)),
                    }));
                } else if (d.discount_type === 'desk' && d.target_item_id) {
                    const [desks] = await db.execute(
                        `SELECT id, desk_number, location, price FROM desks WHERE id = ? LIMIT 1`,
                        [d.target_item_id]
                    );
                    d.items = (desks || []).map((x) => ({
                        id: x.id,
                        name: `Desk ${x.desk_number}${x.location ? ' — ' + x.location : ''}`,
                        normalPrice: Number(x.price || 0),
                        discountedPrice: Number((Number(x.price || 0) * (1 - pct / 100)).toFixed(2)),
                    }));
                }
            } catch (enr) {
                console.warn('discount enrich:', enr.message);
            }
        }

        res.json({
            success: true,
            discounts: rows,
            hasDiscount: rows.length > 0,
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        console.error('active discounts:', error);
        res.status(500).json({ success: false, discounts: [], hasDiscount: false, message: error.message });
    }
});

// Get all menu items (including unavailable for admin view)
router.get('/all', auth, authorize('admin', 'manager', 'receptionist'), async (req, res) => {
    try {
        const [items] = await db.execute('SELECT * FROM food_menu ORDER BY id DESC, category, item_name');
        res.json({ success: true, menuItems: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper: load available menu (works with or without is_hidden column)
async function getAvailableMenuItems() {
    try {
        const [items] = await db.execute(
            'SELECT * FROM food_menu WHERE COALESCE(is_hidden, 0) = 0 AND availability = "available" ORDER BY id DESC, category, item_name'
        );
        return items;
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            try {
                await db.execute('ALTER TABLE food_menu ADD COLUMN is_hidden TINYINT(1) DEFAULT 0');
            } catch (_) { }
            try {
                const [items] = await db.execute(
                    'SELECT * FROM food_menu WHERE COALESCE(is_hidden, 0) = 0 AND availability = "available" ORDER BY id DESC, category, item_name'
                );
                return items;
            } catch (_) {
                const [items] = await db.execute(
                    'SELECT * FROM food_menu WHERE availability = "available" ORDER BY id DESC, category, item_name'
                );
                return items;
            }
        }
        const [items] = await db.execute(
            'SELECT * FROM food_menu WHERE availability = "available" ORDER BY id DESC, category, item_name'
        );
        return items;
    }
}

// Get available menu items (public — customer Order Food page) with active discounts applied
router.get('/', async (req, res) => {
    try {
        const items = await getAvailableMenuItems();
        const discounts = await getActiveDiscounts();
        const menuItems = (items || []).map((it) => decorateItem(it, 'food', discounts));
        res.json({ success: true, menuItems });
    } catch (error) {
        console.error('GET /food error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/menu', async (req, res) => {
    try {
        const items = await getAvailableMenuItems();
        const discounts = await getActiveDiscounts();
        const menuItems = (items || []).map((it) => decorateItem(it, 'food', discounts));
        res.json({ success: true, menuItems });
    } catch (error) {
        console.error('GET /food/menu error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Place food order
router.post('/order', auth, async (req, res) => {
    try {
        const { items, orderType, referenceId, specialInstructions, deliveryType, requiredTime } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'No items in order' });
        }

        // Get or create customer
        let [customer] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        let customerId;
        if (customer.length === 0) {
            const [result] = await db.execute(
                `INSERT INTO customers (user_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)`,
                [req.user.id, req.user.first_name || req.user.firstName || '', req.user.last_name || req.user.lastName || '', req.user.email, req.user.phone || '']
            );
            customerId = result.insertId;
        } else {
            customerId = customer[0].id;
        }

        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
            const [menuItem] = await db.execute(
                'SELECT * FROM food_menu WHERE id = ? AND availability = "available"',
                [item.menuId]
            );
            if (menuItem.length === 0) {
                return res.status(404).json({ success: false, message: 'Menu item not found or unavailable' });
            }

            const base = Number(menuItem[0].price);
            const disc = await getDiscountedPrice('food', menuItem[0].id, base, menuItem[0].category);
            const unit = disc.price;
            const subtotal = unit * item.quantity;
            totalAmount += subtotal;
            orderItems.push({ menuId: item.menuId, quantity: item.quantity, subtotal, unitPrice: unit, originalPrice: base, discountPercent: disc.discountPercent });
        }

        let deskReservationId = null;
        if ((orderType === 'desk' || referenceId) && referenceId) {
            const [deskRes] = await db.execute(
                `SELECT * FROM desk_reservations WHERE id = ? AND customer_id = ? AND status NOT IN ('rejected', 'cancelled')`,
                [referenceId, customerId]
            );
            if (deskRes.length > 0) {
                deskReservationId = deskRes[0].id;
                const desk = deskRes[0];
                // Match food order time with desk reservation window (±2 hours from now within start/end)
                const now = new Date();
                const start = desk.start_time ? new Date(desk.start_time) : null;
                const end = desk.end_time ? new Date(desk.end_time) : null;
                let timesMatch = true;
                if (start && end) {
                    // Order must be placed within desk reservation window (with small tolerance)
                    const tolMs = 2 * 60 * 60 * 1000;
                    timesMatch = now.getTime() >= (start.getTime() - tolMs) && now.getTime() <= (end.getTime() + tolMs);
                }
                if (timesMatch) {
                    await db.execute(
                        `UPDATE desk_reservations SET is_free_with_food = 1, amount = 0, payment_status = 'paid', status = IF(status='awaiting_payment','approved',status) WHERE id = ?`,
                        [deskReservationId]
                    );
                }
                // if times do not match, desk stays paid
            }
        }

        try {
            await db.execute('ALTER TABLE food_orders ADD COLUMN required_time DATETIME NULL');
        } catch (_) { }

        try {
            await db.execute(`ALTER TABLE food_orders MODIFY COLUMN status ENUM(
                'pending','awaiting_payment','waiting','approved','preparing','ready','served','cancelled','delivered'
            ) DEFAULT 'waiting'`);
        } catch (e) { console.error('food status enum:', e.message); }

        if (!requiredTime) {
            return res.status(400).json({ success: false, message: 'Please provide the time when the food is required' });
        }
        // > 1 hour until required → waiting; ≤ 1 hour → ready
        let requiredAt = new Date(requiredTime);
        if (isNaN(requiredAt.getTime()) && typeof requiredTime === 'string') {
            requiredAt = new Date(String(requiredTime).replace(' ', 'T'));
        }
        if (isNaN(requiredAt.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid required time for food order' });
        }
        if (requiredAt.getTime() < Date.now() - 60 * 1000) {
            return res.status(400).json({
                success: false,
                message: 'Food required time cannot be in the past',
            });
        }
        const nowServer = new Date();
        const diffHours = (requiredAt.getTime() - nowServer.getTime()) / (1000 * 60 * 60);
        let initialFoodStatus = 'waiting';
        if (!isNaN(requiredAt.getTime()) && diffHours <= 1) {
            initialFoodStatus = 'ready';
        }
        console.log('Food status calc', { requiredTime, diffHours, initialFoodStatus });
        const reference = 'FOOD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

        const [orderResult] = await db.execute(
            `INSERT INTO food_orders
            (customer_id, order_type, reference_id, desk_reservation_id, total_amount,
             status, payment_status, payment_reference, special_instructions, delivery_type, required_time)
            VALUES (?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?)`,
            [
                customerId,
                orderType || 'takeaway',
                referenceId || null,
                deskReservationId,
                totalAmount,
                initialFoodStatus,
                reference,
                specialInstructions || '',
                deliveryType || 'pickup',
                requiredTime
            ]
        );

        const orderId = orderResult.insertId;

        for (const item of orderItems) {
            await db.execute(
                'INSERT INTO food_order_items (order_id, menu_id, quantity, subtotal) VALUES (?, ?, ?, ?)',
                [orderId, item.menuId, item.quantity, item.subtotal]
            );
        }

        await logAuditAction(req.user.id, req.user.role, 'CREATE_FOOD_ORDER', 'food', orderId, { totalAmount });

        await notifyStaff({
            type: 'food_order',
            title: 'New Food Order',
            message: `${req.user.first_name || ''} ${req.user.last_name || ''} ordered food (ETB ${totalAmount}). Status: ${initialFoodStatus}. Required: ${requiredTime}`,
            link: '/dashboard/receptionist?tab=food'
        });

        sendNotificationEmail(
            req.user.email,
            'Food Order Placed',
            `Your food order #${orderId} (ETB ${totalAmount}) has been submitted. Status: ${initialFoodStatus}.`
        );

        res.status(201).json({
            success: true,
            message: 'Your food order has been submitted successfully.',
            order: {
                id: orderId,
                totalAmount,
                paymentReference: reference,
                status: initialFoodStatus,
                requiredTime
            }
        });
    } catch (error) {
        console.error('Food order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get user's orders
router.get('/my', auth, async (req, res) => {
    try {
        const [orders] = await db.execute(
            `SELECT o.*,
                    (SELECT COUNT(*) FROM food_order_items WHERE order_id = o.id) as item_count
            FROM food_orders o
            WHERE o.customer_id = (SELECT id FROM customers WHERE user_id = ?)
            ORDER BY o.order_date DESC`,
            [req.user.id]
        );
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pending food orders (receptionist/admin)
router.get('/pending', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const [orders] = await db.execute(
            `SELECT o.*, c.first_name, c.last_name, c.email
            FROM food_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE o.status IN ('waiting', 'preparing', 'ready', 'awaiting_payment')
            ORDER BY o.order_date DESC`
        );
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all orders (receptionist/admin)
router.get('/orders', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const [orders] = await db.execute(
            `SELECT o.*, c.first_name, c.last_name, c.email
            FROM food_orders o
            LEFT JOIN customers c ON o.customer_id = c.id
            ORDER BY o.order_date DESC LIMIT 100`
        );
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get order items
router.get('/:id/items', auth, async (req, res) => {
    try {
        const [items] = await db.execute(
            `SELECT foi.*, fm.item_name, fm.category, fm.price
             FROM food_order_items foi
             LEFT JOIN food_menu fm ON foi.menu_id = fm.id
             WHERE foi.order_id = ?`,
            [req.params.id]
        );
        res.json({ success: true, items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Action on food order (receptionist/admin)
router.post('/:id/action', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const { action, rejectionReason, deliveryType } = req.body;
        const orderId = req.params.id;

        const [existingRows] = await db.execute(
            `SELECT o.*, c.email, c.user_id as customer_user_id FROM food_orders o 
             LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = ?`,
            [orderId]
        );
        const existing = existingRows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });

        if (action === 'waiting') {
            await db.execute('UPDATE food_orders SET status = "waiting", is_read = 1 WHERE id = ?', [orderId]);
            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'food_waiting',
                title: 'Food Order Received',
                message: `Your food order #${orderId} is waiting to be prepared.`,
                link: '/dashboard/customer'
            });
            res.json({ success: true, message: 'Order marked as waiting' });

        } else if (action === 'approve') {
            await db.execute('UPDATE food_orders SET status = "preparing", is_read = 1 WHERE id = ?', [orderId]);

            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'food_approved',
                title: 'Food Order Approved',
                message: `Your food order #${orderId} has been approved and is being prepared.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(existing.email, 'Food Order Approved', `Your food order #${orderId} has been approved.`);
            res.json({ success: true, message: 'Food order approved' });

        } else if (action === 'preparing') {
            await db.execute('UPDATE food_orders SET status = "preparing" WHERE id = ?', [orderId]);

            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'food_preparing',
                title: 'Food Order Being Prepared',
                message: `Your food order #${orderId} is now being prepared by our kitchen.`,
                link: '/dashboard/customer'
            });

            res.json({ success: true, message: 'Order marked as preparing' });

        } else if (action === 'ready') {
            const dtUpdate = deliveryType ? ', delivery_type = ?' : '';
            const params = deliveryType ? [orderId, deliveryType] : [orderId];
            await db.execute(`UPDATE food_orders SET status = "ready" ${dtUpdate} WHERE id = ?`,
                deliveryType ? [deliveryType, orderId] : [orderId]);

            // Immediate notification when food is ready
            const custUserId = await getUserIdForCustomer(existing.customer_id);
            const isDelivery = (deliveryType || existing.delivery_type) === 'delivery';
            await notifyUser(custUserId, {
                type: 'food_ready',
                title: '🍽️ Your Food is Ready!',
                message: `Your food order #${orderId} is ready! ${isDelivery ? 'It will be delivered to you shortly.' : 'Please come to collect your order.'}`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(existing.email, 'Your Food Order is Ready!',
                `Your food order #${orderId} is ready! ${isDelivery ? 'It will be delivered soon.' : 'Please collect from the counter.'}`);

            res.json({ success: true, message: 'Food order marked as ready - customer notified!' });

        } else if (action === 'served' || action === 'delivered') {
            await db.execute('UPDATE food_orders SET status = ? WHERE id = ?', [action, orderId]);
            res.json({ success: true, message: `Food order marked as ${action}` });

        } else if (action === 'reject') {
            await db.execute(
                'UPDATE food_orders SET status = "cancelled", rejection_reason = ?, is_read = 1 WHERE id = ?',
                [rejectionReason || 'Cancelled by staff', orderId]
            );

            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'food_rejected',
                title: 'Food Order Cancelled',
                message: `Your food order #${orderId} was cancelled: ${rejectionReason || 'Staff decision'}.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(existing.email, 'Food Order Cancelled',
                `Your food order #${orderId} was cancelled. Reason: ${rejectionReason || 'Staff decision'}.`);
            res.json({ success: true, message: 'Food order cancelled' });

        } else {
            res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// Manager: hide/show food item from customers
router.put('/menu/:id/visibility', auth, authorize('manager', 'admin'), async (req, res) => {
    try {
        const hidden = req.body.hidden ? 1 : 0;
        // ensure column exists soft-fail
        try {
            await db.execute('UPDATE food_menu SET is_hidden = ? WHERE id = ?', [hidden, req.params.id]);
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR') {
                await db.execute('ALTER TABLE food_menu ADD COLUMN is_hidden TINYINT(1) DEFAULT 0');
                await db.execute('UPDATE food_menu SET is_hidden = ? WHERE id = ?', [hidden, req.params.id]);
            } else throw e;
        }
        res.json({ success: true, message: hidden ? 'Food item hidden from customers' : 'Food item visible to customers' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark food order ready -> notify customer
router.post('/:id/ready', auth, authorize('receptionist', 'manager', 'admin'), async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM food_orders WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });
        await db.execute(`UPDATE food_orders SET status = 'ready' WHERE id = ?`, [req.params.id]);
        const order = rows[0];
        const custUserId = await getUserIdForCustomer(order.customer_id);
        if (custUserId) {
            await notifyUser(custUserId, {
                type: 'food_ready',
                title: 'Your food is ready!',
                message: `Food order #${order.id} is ready for pickup/serving.`,
                link: '/dashboard/customer'
            });
        }
        res.json({ success: true, message: 'Order marked ready and customer notified' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;
