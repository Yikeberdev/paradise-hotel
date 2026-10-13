const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

function normalizeRoomImage(row) {
    if (!row) return row;
    let img = row.image;
    if (!img) return row;
    img = String(img).replace(/\\/g, '/').trim();
    if (img.startsWith('http') || img.startsWith('/uploads/')) {
        row.image = img;
    } else if (img.startsWith('uploads/')) {
        row.image = '/' + img;
    } else {
        row.image = '/uploads/rooms/' + img.replace(/^.*\//, '');
    }
    return row;
}


/**
 * When checkout DATE is reached (check_out_date <= today):
 *  1) reservation → checked_out
 *  2) room.status → available (if no other active paid stay)
 * Runs on every rooms API call and via server interval.
 */
async function rejectUnpaidRoomReservations() {
    try {
        await db.execute(
            `UPDATE room_reservations
             SET status = 'rejected',
                 rejection_reason = COALESCE(rejection_reason, 'Payment not completed — reservation rejected')
             WHERE status IN ('pending', 'awaiting_payment')
               AND (payment_status IS NULL OR payment_status IN ('pending', 'unpaid', 'failed'))
               AND reservation_date < (NOW() - INTERVAL 20 MINUTE)`
        );
        await db.execute(
            `UPDATE room_reservations
             SET status = 'rejected',
                 rejection_reason = COALESCE(rejection_reason, 'Payment failed — reservation rejected')
             WHERE status IN ('pending', 'awaiting_payment')
               AND payment_status = 'failed'`
        );
    } catch (e) {
        console.error('rejectUnpaidRoomReservations:', e.message);
    }
}

async function releaseExpiredRooms() {
    try {
        await rejectUnpaidRoomReservations();

        // Checkout date reached → mark stay finished
        const [result] = await db.execute(
            `UPDATE room_reservations
             SET status = 'checked_out'
             WHERE status IN ('pending', 'approved', 'checked_in')
               AND DATE(check_out_date) <= CURDATE()`
        );

        // Any room with no active paid occupancy → available
        try {
            await db.execute(
                `UPDATE rooms r
                 SET r.status = 'available'
                 WHERE COALESCE(r.status, 'available') IN ('booked', 'reserved', 'available')
                   AND COALESCE(r.status, '') <> 'maintenance'
                   AND NOT EXISTS (
                     SELECT 1 FROM room_reservations rr
                     WHERE rr.room_id = r.id
                       AND rr.status IN ('approved', 'checked_in')
                       AND rr.payment_status = 'paid'
                       AND DATE(rr.check_out_date) > CURDATE()
                   )`
            );
        } catch (e2) {
            console.error('free room status:', e2.message);
        }

        return result;
    } catch (e) {
        console.error('releaseExpiredRooms:', e.message);
    }
}

// Export for server.js interval
router.releaseExpiredRooms = releaseExpiredRooms;

router.get('/', async (req, res) => {
    try {
        await releaseExpiredRooms();
        const [rooms] = await db.execute('SELECT * FROM rooms ORDER BY room_number');
        res.json({ success: true, rooms: rooms.map(normalizeRoomImage) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/available', async (req, res) => {
    try {
        await releaseExpiredRooms();
        let checkIn = req.query.checkIn || req.query.check_in || new Date().toISOString().slice(0, 10);
        let checkOut = req.query.checkOut || req.query.check_out;
        if (!checkOut) {
            const d = new Date(checkIn);
            d.setDate(d.getDate() + 1);
            checkOut = d.toISOString().slice(0, 10);
        }
        // Room is free unless there is a paid stay overlapping the requested window
        // and still before/on active period (checkout date not yet reached)
        const [rooms] = await db.execute(
            `SELECT r.* FROM rooms r
             WHERE (r.status IS NULL OR r.status NOT IN ('maintenance'))
               AND r.id NOT IN (
                 SELECT rr.room_id FROM room_reservations rr
                 WHERE rr.room_id IS NOT NULL
                   AND (
                     (
                       rr.status IN ('approved', 'checked_in')
                       AND rr.payment_status = 'paid'
                       AND DATE(rr.check_out_date) > CURDATE()
                       AND rr.check_in_date < ?
                       AND rr.check_out_date > ?
                     )
                     OR
                     (
                       rr.status = 'pending'
                       AND (rr.payment_status IS NULL OR rr.payment_status = 'pending')
                       AND rr.reservation_date >= (NOW() - INTERVAL 20 MINUTE)
                       AND DATE(rr.check_out_date) > CURDATE()
                       AND rr.check_in_date < ?
                       AND rr.check_out_date > ?
                     )
                   )
               )
             ORDER BY r.id DESC, r.room_number`,
            [checkOut, checkIn, checkOut, checkIn]
        );
        res.json({ success: true, rooms: (rooms || []).map(normalizeRoomImage), checkIn, checkOut });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/status', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await releaseExpiredRooms();
        const filter = String(req.query.filter || 'available').toLowerCase();

        if (filter === 'all') {
            const [rows] = await db.execute(
                `SELECT
                    r.*,
                    CASE
                      WHEN EXISTS (
                        SELECT 1 FROM room_reservations rr
                        WHERE rr.room_id = r.id
                          AND rr.status IN ('approved', 'checked_in')
                          AND rr.payment_status = 'paid'
                          AND DATE(rr.check_out_date) > CURDATE()
                      ) THEN 'reserved'
                      ELSE 'available'
                    END AS inventory_status
                 FROM rooms r
                 WHERE (r.status IS NULL OR r.status NOT IN ('maintenance'))
                 ORDER BY r.id DESC, r.room_number ASC`
            );
            return res.json({ success: true, rooms: rows, filter: 'all', count: rows.length });
        }

        if (filter === 'reserved' || filter === 'booked') {
            const [rows] = await db.execute(
                `SELECT
                    r.*,
                    'reserved' AS inventory_status,
                    rr.id AS reservation_id,
                    rr.check_in_date,
                    rr.check_out_date,
                    'reserved' AS reservation_status,
                    rr.payment_status,
                    rr.total_price,
                    COALESCE(
                      NULLIF(TRIM(rr.guest_name), ''),
                      NULLIF(TRIM(CONCAT(COALESCE(c.first_name, u.first_name, ''), ' ', COALESCE(c.last_name, u.last_name, ''))), ''),
                      '—'
                    ) AS guest_name,
                    COALESCE(NULLIF(c.first_name, ''), NULLIF(u.first_name, ''), '') AS first_name,
                    COALESCE(NULLIF(c.last_name, ''), NULLIF(u.last_name, ''), '') AS last_name,
                    u.username,
                    COALESCE(c.email, rr.guest_email, u.email, '') AS email,
                    COALESCE(c.phone, rr.guest_phone, u.phone, '') AS phone
                 FROM room_reservations rr
                 INNER JOIN rooms r ON r.id = rr.room_id
                 LEFT JOIN customers c ON c.id = rr.customer_id
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE rr.status IN ('approved', 'checked_in')
                   AND rr.payment_status = 'paid'
                   AND DATE(rr.check_out_date) > CURDATE()
                 ORDER BY rr.id DESC, r.room_number ASC`
            );
            return res.json({ success: true, rooms: rows, filter: 'reserved', count: rows.length });
        }

        const [rows] = await db.execute(
            `SELECT
                r.*,
                'available' AS inventory_status,
                NULL AS reservation_id,
                '' AS first_name,
                '' AS last_name,
                '—' AS guest_name,
                '' AS email,
                '' AS phone,
                '' AS username
             FROM rooms r
             WHERE (r.status IS NULL OR r.status NOT IN ('maintenance'))
               AND NOT EXISTS (
                 SELECT 1 FROM room_reservations rr
                 WHERE rr.room_id = r.id
                   AND rr.status IN ('approved', 'checked_in')
                   AND rr.payment_status = 'paid'
                   AND DATE(rr.check_out_date) > CURDATE()
               )
             ORDER BY r.id DESC, r.room_number ASC`
        );
        return res.json({ success: true, rooms: rows, filter: 'available', count: rows.length });
    } catch (error) {
        console.error('rooms/status error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/release-expired', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        await releaseExpiredRooms();
        res.json({
            success: true,
            message: 'Rooms with checkout date reached are now available.',
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
module.exports.releaseExpiredRooms = releaseExpiredRooms;
