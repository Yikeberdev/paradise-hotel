const { getActiveDiscounts, decorateItem, getDiscountedPrice } = require('../utils/discounts');
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');
const { sendNotificationEmail } = require('../utils/email');
const { logAuditAction } = require('../utils/audit');
const { uploadDeskImage } = require('../middleware/upload');

// Complete past reservations; availability is computed from time periods (not permanent flags)
async function releaseExpiredDesks() {
    try {
        await db.execute(
            `UPDATE desk_reservations SET status = 'completed'
             WHERE status IN ('approved', 'awaiting_payment')
               AND end_time IS NOT NULL AND end_time < NOW()`
        );
        await db.execute(
            `UPDATE desks SET status = 'available'
             WHERE status IN ('reserved', 'booked')
               AND id NOT IN (
                 SELECT desk_id FROM desk_reservations
                 WHERE status IN ('approved', 'awaiting_payment')
                   AND start_time <= NOW() AND end_time > NOW()
               )`
        );
    } catch (error) {
        console.error('releaseExpiredDesks error:', error.message);
    }
}

// Get all desks (with active discounts on price)
router.get('/', async (req, res) => {
    try {
        await releaseExpiredDesks();
        const [desks] = await db.execute('SELECT * FROM desks ORDER BY id DESC, desk_number');
        const discounts = await getActiveDiscounts();
        res.json({ success: true, desks: (desks || []).map((d) => decorateItem(d, 'desk', discounts)) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Available desks for an optional time window.
 * Query: date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM)
 * If omitted, excludes only desks currently in an active reservation period.
 * Overlap rule: requestedStart < existingEnd AND requestedEnd > existingStart
 */
router.get('/available', async (req, res) => {
    try {
        await releaseExpiredDesks();
        const { date, startTime, endTime } = req.query;

        let rangeStart = null;
        let rangeEnd = null;
        if (date && startTime && endTime) {
            rangeStart = new Date(`${date}T${startTime}`);
            rangeEnd = new Date(`${date}T${endTime}`);
            if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeEnd <= rangeStart) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date/time range. End time must be after start time.'
                });
            }
        }

        let sql;
        let params = [];
        if (rangeStart && rangeEnd) {
            sql = `SELECT d.* FROM desks d
                   WHERE (d.status IS NULL OR d.status NOT IN ('maintenance'))
                     AND d.id NOT IN (
                       SELECT desk_id FROM desk_reservations
                       WHERE status IN ('awaiting_payment', 'approved')
                         AND desk_id IS NOT NULL
                         AND start_time < ? AND end_time > ?
                     )
                   ORDER BY d.id DESC, d.desk_number`;
            params = [rangeEnd, rangeStart];
        } else {
            // Currently free (not in active reservation right now)
            sql = `SELECT d.* FROM desks d
                   WHERE (d.status IS NULL OR d.status NOT IN ('maintenance'))
                     AND d.id NOT IN (
                       SELECT desk_id FROM desk_reservations
                       WHERE status IN ('awaiting_payment', 'approved')
                         AND desk_id IS NOT NULL
                         AND start_time <= NOW() AND end_time > NOW()
                     )
                   ORDER BY d.id DESC, d.desk_number`;
        }

        const [desks] = await db.execute(sql, params);
        const discounts = await getActiveDiscounts();
        res.json({ success: true, desks: (desks || []).map((d) => decorateItem(d, 'desk', discounts)) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Receptionist status filter: available | reserved
 * reserved = desks with an active reservation at current server time
 */
router.get('/status', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await releaseExpiredDesks();
        const filter = String(req.query.filter || 'available').toLowerCase().trim();

        // Shared rule: a desk is "reserved" if it has any non-cancelled reservation that has not ended yet.
        // Available and reserved are mutually exclusive under this rule.

        if (filter === 'reserved' || filter === 'booked') {
            const [rows] = await db.execute(
                `SELECT
                    d.id,
                    d.desk_number,
                    d.location,
                    d.capacity,
                    d.price,
                    d.status AS desk_status,
                    'reserved' AS inventory_status,
                    dr.id AS reservation_id,
                    dr.start_time,
                    dr.end_time,
                    dr.reservation_date,
                    dr.status AS reservation_status,
                    dr.payment_status,
                    dr.amount,
                    dr.guest_name AS reservation_guest_name,
                    dr.guest_email AS reservation_guest_email,
                    dr.guest_phone AS reservation_guest_phone,
                    c.first_name AS cust_first,
                    c.last_name AS cust_last,
                    c.email AS cust_email,
                    c.phone AS cust_phone,
                    u.first_name AS user_first,
                    u.last_name AS user_last,
                    u.username,
                    u.email AS user_email,
                    u.phone AS user_phone
                 FROM desk_reservations dr
                 INNER JOIN desks d ON d.id = dr.desk_id
                 LEFT JOIN customers c ON c.id = dr.customer_id
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE dr.status NOT IN ('cancelled', 'rejected', 'completed')
                   AND (dr.end_time IS NULL OR dr.end_time > NOW())
                 ORDER BY dr.start_time ASC, d.desk_number ASC`
            );

            const cleanName = (v) => {
                if (v == null) return '';
                const s = String(v).trim();
                if (!s || s === 'undefined' || s === 'null' || /^undefined(\s+undefined)*$/i.test(s)) return '';
                return s;
            };
            const desks = rows.map((row) => {
                const first = cleanName(row.cust_first) || cleanName(row.user_first);
                const last = cleanName(row.cust_last) || cleanName(row.user_last);
                let guest = cleanName(row.reservation_guest_name);
                if (guest && /^undefined(\s+undefined)*$/i.test(guest)) guest = '';
                if (!guest && (first || last)) guest = `${first} ${last}`.trim();
                const username = cleanName(row.username);
                const full = guest || [first, last].filter(Boolean).join(' ').trim() || username || '';
                return {
                    id: row.id,
                    desk_number: row.desk_number,
                    location: row.location,
                    capacity: row.capacity,
                    price: row.price,
                    desk_status: row.desk_status,
                    inventory_status: 'reserved',
                    reservation_id: row.reservation_id,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    reservation_date: row.reservation_date,
                    reservation_status: row.reservation_status,
                    payment_status: row.payment_status,
                    amount: row.amount,
                    first_name: first || '',
                    last_name: last || '',
                    guest_name: full || '—',
                    full_name: full || '—',
                    username: username || '',
                    email: cleanName(row.cust_email) || cleanName(row.reservation_guest_email) || cleanName(row.user_email) || '—',
                    phone: cleanName(row.cust_phone) || cleanName(row.reservation_guest_phone) || cleanName(row.user_phone) || '—',
                };
            });

            return res.json({ success: true, desks, filter: 'reserved', count: desks.length });
        }

        // Available: desks with NO open reservation (same exclusion as reserved — mutually exclusive)
        const [rows] = await db.execute(
            `SELECT d.id, d.desk_number, d.location, d.capacity, d.price, d.status, d.image
             FROM desks d
             WHERE (d.status IS NULL OR d.status NOT IN ('maintenance'))
               AND d.id NOT IN (
                 SELECT dr.desk_id FROM desk_reservations dr
                 WHERE dr.desk_id IS NOT NULL
                   AND dr.status NOT IN ('cancelled', 'rejected', 'completed')
                   AND (dr.end_time IS NULL OR dr.end_time > NOW())
               )
             ORDER BY d.id DESC, d.desk_number ASC`
        );

        const desks = rows.map((d) => ({
            id: d.id,
            desk_number: d.desk_number,
            location: d.location,
            capacity: d.capacity,
            price: d.price,
            status: 'available',
            inventory_status: 'available',
            reservation_id: null,
            first_name: '',
            last_name: '',
            guest_name: '—',
            full_name: '—',
            email: '',
            phone: '',
            username: '',
            payment_status: null,
            reservation_status: null,
            start_time: null,
            end_time: null,
        }));

        return res.json({ success: true, desks, filter: 'available', count: desks.length });
    } catch (error) {
        console.error('desks/status error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reserve desk
router.post('/reserve', auth, async (req, res) => {
    try {
        const { deskId, date, partySize, timeSlot, specialRequests, startTime, endTime, withFood } = req.body;

        if (!startTime || !endTime || !date) {
            return res.status(400).json({ success: false, message: 'Date, start time, and end time are required' });
        }

        // Normalize time to HH:MM:SS for reliable parsing
        const normTime = (t) => {
            const s = String(t || '').trim();
            if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
            if (/^\d{1,2}:\d{2}$/.test(s)) return s + ':00';
            return s;
        };
        const startDateTime = new Date(`${date}T${normTime(startTime)}`);
        const endDateTime = new Date(`${date}T${normTime(endTime)}`);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date or time' });
        }
        if (endDateTime <= startDateTime) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }
        // Reject past date/time
        const now = new Date();
        if (endDateTime.getTime() <= now.getTime()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reserve a desk in the past. Choose a future date and time.',
            });
        }
        if (startDateTime.getTime() < now.getTime() - 60 * 1000) {
            return res.status(400).json({
                success: false,
                message: 'Start time cannot be in the past. Choose a future time.',
            });
        }

        // Duration in hours — charge at least 30 minutes (0.5h), round up to next 0.25 hour
        const rawHours = (endDateTime - startDateTime) / (1000 * 60 * 60);
        const durationHours = Math.max(0.5, Math.ceil(rawHours * 4) / 4);

        // Check desk
        const [desk] = await db.execute('SELECT * FROM desks WHERE id = ?', [deskId]);
        if (desk.length === 0) {
            return res.status(404).json({ success: false, message: 'Desk not found' });
        }

        // Check overlapping desk reservations
        const [overlaps] = await db.execute(
            `SELECT id FROM desk_reservations
             WHERE desk_id = ?
               AND status IN ('awaiting_payment', 'approved')
               AND (start_time < ? AND end_time > ?)`,
            [deskId, endDateTime, startDateTime]
        );
        if (overlaps.length > 0) {
            return res.status(400).json({ success: false, message: 'This desk is already booked during the selected period. Please choose another desk or time.' });
        }

        // Get or create customer
        let [customer] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        let customerId;
        if (customer.length === 0) {
            const [result] = await db.execute(
                `INSERT INTO customers (user_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)`,
                [req.user.id, req.user.first_name, req.user.last_name, req.user.email, req.user.phone || '']
            );
            customerId = result.insertId;
        } else {
            customerId = customer[0].id;
        }

        // Desk is free only if customer has (or will link) a food order whose time overlaps this desk slot.
        // withFood flag alone is not enough — verify existing paid/awaiting food orders for same customer with overlapping time.
        let isFree = false;
        if (withFood) {
            // Tentative free; becomes permanent when a matching food order is placed.
            // Check existing food orders for this customer around this window
            try {
                const [foodOrders] = await db.execute(
                    `SELECT id, created_at, status, payment_status, desk_reservation_id
                     FROM food_orders
                     WHERE customer_id = ?
                       AND status NOT IN ('cancelled', 'rejected')
                       AND payment_status IN ('paid', 'unpaid', 'pending')
                       AND created_at >= DATE_SUB(?, INTERVAL 2 HOUR)
                       AND created_at <= DATE_ADD(?, INTERVAL 2 HOUR)`,
                    [customerId, startDateTime, endDateTime]
                );
                if (foodOrders.length > 0) {
                    isFree = true;
                }
            } catch (e) {
                console.error('food overlap check', e.message);
            }
        }
        // If only withFood requested without existing matching order, charge normally until food is ordered with matching time
        // (food order endpoint will zero desk fee when times match)
        let unitPrice = Number(desk[0].price || 0);
        try {
            const disc = await getDiscountedPrice('desk', desk[0].id, unitPrice, desk[0].location);
            unitPrice = Number(disc.price);
        } catch (_) { }
        if (!isFree && (!unitPrice || unitPrice <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'This desk has no valid hourly rate configured. Contact the hotel.',
            });
        }
        // Always charge by duration unless desk is free with a matching food order
        let amount = isFree ? 0 : Number((unitPrice * durationHours).toFixed(2));
        // Guard: never allow 0 birr paid reservation for a timed desk without free-with-food
        if (!isFree && amount <= 0) {
            amount = Number((unitPrice * Math.max(durationHours, 0.5)).toFixed(2));
        }
        if (!isFree && amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Could not calculate desk fee. Check duration and desk price.',
            });
        }
        const reference = 'DSK-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

        const [result] = await db.execute(
            `INSERT INTO desk_reservations
            (desk_id, customer_id, guest_name, guest_phone, guest_email,
             reservation_date, time_slot, start_time, end_time, duration_hours,
             is_free_with_food, amount, party_size, status, payment_status, payment_reference, special_requests)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?)`,
            [
                deskId, customerId,
                [req.user.first_name, req.user.last_name].filter(v => v && String(v) !== 'undefined').join(' ').trim()
                || req.user.username || req.user.email || 'Customer',
                req.user.phone && String(req.user.phone) !== 'undefined' ? req.user.phone : '',
                req.user.email && String(req.user.email) !== 'undefined' ? req.user.email : '',
                date, timeSlot || 'any', startDateTime, endDateTime, durationHours,
                isFree ? 1 : 0, amount, partySize || 2,
                isFree ? 'paid' : 'unpaid',
                reference, specialRequests || ''
            ]
        );

        if (isFree) {
            await db.execute(
                `UPDATE desk_reservations SET status = 'approved', payment_status = 'paid' WHERE id = ?`,
                [result.insertId]
            );
            // Mark inventory reserved only while the period is currently active
            await db.execute(
                `UPDATE desks SET status = IF(? <= NOW() AND ? > NOW(), 'reserved', 'available') WHERE id = ?`,
                [startDateTime, endDateTime, deskId]
            );
        }

        await logAuditAction(req.user.id, req.user.role, 'CREATE_DESK_RESERVATION', 'desk', result.insertId, {
            deskId,
            amount,
            isFree
        });

        await notifyStaff({
            type: 'desk_reservation',
            title: 'New Desk Reservation Request',
            message: `${req.user.first_name} ${req.user.last_name} reserved Desk #${desk[0].desk_number}` +
                (isFree ? ' (free with food order).' : ` for ETB ${amount}.`),
            link: '/dashboard/receptionist'
        });

        sendNotificationEmail(
            req.user.email,
            'Desk Reservation Request Received',
            `Your desk reservation request for Desk #${desk[0].desk_number} has been received.` +
            (isFree ? ' Your desk service is free with food order.' : ` Please complete payment of ETB ${amount}.`)
        );

        res.status(201).json({
            success: true,
            message: isFree
                ? 'Desk reserved for free. Please place your food order to complete your visit.'
                : 'Desk reserved successfully! Please complete payment.',
            reservation: {
                id: result.insertId,
                totalPrice: amount,
                isFree,
                durationHours,
                paymentReference: reference,
                status: 'awaiting_payment'
            }
        });
    } catch (error) {
        console.error('Desk reservation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Customer's desk reservations
router.get('/my', auth, async (req, res) => {
    try {
        await releaseExpiredDesks();
        const [reservations] = await db.execute(
            `SELECT d.*, dk.desk_number, dk.location
             FROM desk_reservations d
             LEFT JOIN desks dk ON d.desk_id = dk.id
             WHERE d.customer_id = (SELECT id FROM customers WHERE user_id = ?)
             ORDER BY d.created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Pending desk reservations
router.get('/pending', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        await releaseExpiredDesks();
        const [reservations] = await db.execute(
            `SELECT d.*, dk.desk_number, c.first_name, c.last_name, c.email
            FROM desk_reservations d
            LEFT JOIN desks dk ON d.desk_id = dk.id
            LEFT JOIN customers c ON d.customer_id = c.id
            WHERE d.status = 'awaiting_payment'
            ORDER BY d.created_at DESC`
        );
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Action on desk reservation (Approve / Reject)
router.post('/:id/action', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const { action, rejectionReason } = req.body;
        const reservationId = req.params.id;

        const [existingRows] = await db.execute(
            'SELECT desk_id, customer_id, guest_email FROM desk_reservations WHERE id = ?',
            [reservationId]
        );
        const existing = existingRows[0];
        if (!existing) return res.status(404).json({ success: false, message: 'Reservation not found' });

        if (action === 'approve') {
            await db.execute(
                'UPDATE desk_reservations SET status = "approved", is_read = 1 WHERE id = ?',
                [reservationId]
            );
            await db.execute('UPDATE desks SET status = "reserved" WHERE id = ?', [existing.desk_id]);

            await logAuditAction(req.user.id, req.user.role, 'APPROVE_DESK_RESERVATION', 'desk', reservationId);

            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'desk_approved',
                title: 'Desk Reservation Approved',
                message: `Your desk reservation #${reservationId} has been approved by the receptionist.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                existing.guest_email,
                'Desk Reservation Approved',
                `Your desk reservation #${reservationId} has been Approved!`
            );

            res.json({ success: true, message: 'Desk reservation approved successfully' });
        } else if (action === 'reject') {
            await db.execute(
                'UPDATE desk_reservations SET status = "rejected", rejection_reason = ?, is_read = 1 WHERE id = ?',
                [rejectionReason || 'Rejected by receptionist', reservationId]
            );
            await db.execute('UPDATE desks SET status = "available" WHERE id = ?', [existing.desk_id]);

            await logAuditAction(req.user.id, req.user.role, 'REJECT_DESK_RESERVATION', 'desk', reservationId, { rejectionReason });

            const custUserId = await getUserIdForCustomer(existing.customer_id);
            await notifyUser(custUserId, {
                type: 'desk_rejected',
                title: 'Desk Reservation Rejected',
                message: `Your desk reservation #${reservationId} was rejected: ${rejectionReason || 'Staff review failed'}.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                existing.guest_email,
                'Desk Reservation Rejected',
                `Your desk reservation #${reservationId} was rejected. Reason: ${rejectionReason || 'Staff review failed'}.`
            );

            res.json({ success: true, message: 'Desk reservation rejected' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// All desk reservations for staff
router.get('/reservations', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await releaseExpiredDesks();
        const { status, q } = req.query;
        let sql = `SELECT d.*, dk.desk_number, dk.location, dk.capacity,
                          COALESCE(NULLIF(TRIM(d.guest_name), ''), CONCAT(c.first_name, ' ', c.last_name)) as guest_name,
                          c.first_name, c.last_name, u.username,
                          COALESCE(c.email, d.guest_email) as email,
                          COALESCE(c.phone, d.guest_phone) as phone
                   FROM desk_reservations d
                   LEFT JOIN desks dk ON d.desk_id = dk.id
                   LEFT JOIN customers c ON d.customer_id = c.id
                   LEFT JOIN users u ON c.user_id = u.id
                   WHERE 1=1`;
        const params = [];
        if (status) { sql += ' AND d.status = ?'; params.push(status); }
        if (q) {
            sql += ` AND (d.guest_name LIKE ? OR d.guest_email LIKE ? OR d.guest_phone LIKE ?
                    OR dk.desk_number LIKE ? OR d.payment_reference LIKE ?)`;
            const like = '%' + q + '%';
            params.push(like, like, like, like, like);
        }
        sql += ' ORDER BY d.created_at DESC LIMIT 300';
        const [reservations] = await db.execute(sql, params);
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



// Upload / replace desk image (admin, manager)
router.post('/:id/image', auth, authorize('admin', 'manager'), uploadDeskImage.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image file is required' });
        }
        const imagePath = '/uploads/desks/' + req.file.filename;
        await db.execute('UPDATE desks SET image = ? WHERE id = ?', [imagePath, req.params.id]);
        res.json({ success: true, message: 'Desk image updated', image: imagePath });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete desk image
router.delete('/:id/image', auth, authorize('admin', 'manager'), async (req, res) => {
    try {
        await db.execute('UPDATE desks SET image = NULL WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Desk image removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;
