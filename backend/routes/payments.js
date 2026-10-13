const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { uploadReceipt } = require('../middleware/upload');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');
const { sendNotificationEmail } = require('../utils/email');
const { logAuditAction } = require('../utils/audit');
const BankAccount = require('../models/BankAccount');

// CBE & Telebirr details endpoint
router.get('/cbe-details', auth, async (req, res) => {
    try {
        // Multiple hotel banks from account database (read-only for customers)
        const accounts = await BankAccount.findHotelAccounts();
        res.json({
            success: true,
            message: 'Use these hotel accounts for payment method selection. Details are not editable by customers.',
            accounts,
            // legacy shape kept empty so old UI does not show fixed numbers for manual transfer
            cbe: null,
            telebirr: null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


router.get('/booking-details', auth, async (req, res) => {
    try {
        const { type, id } = req.query;
        if (!type || !id) {
            return res.status(400).json({ success: false, message: 'Type and ID are required' });
        }

        let booking = null;
        if (type === 'room') {
            const [rows] = await db.execute(
                `SELECT r.*, rm.room_number, rm.room_type, rm.price_per_night
                 FROM room_reservations r
                 LEFT JOIN rooms rm ON r.room_id = rm.id
                 WHERE r.id = ?`,
                [id]
            );
            if (rows.length > 0) {
                booking = {
                    id: rows[0].id,
                    totalPrice: Number(rows[0].total_price),
                    room_number: rows[0].room_number,
                    room_type: rows[0].room_type,
                    payment_status: rows[0].payment_status,
                    status: rows[0].status
                };
            }
        } else if (type === 'desk') {
            const [rows] = await db.execute(
                `SELECT d.*, dk.desk_number, dk.location
                 FROM desk_reservations d
                 LEFT JOIN desks dk ON d.desk_id = dk.id
                 WHERE d.id = ?`,
                [id]
            );
            if (rows.length > 0) {
                booking = {
                    id: rows[0].id,
                    totalPrice: Number(rows[0].amount),
                    desk_number: rows[0].desk_number,
                    location: rows[0].location,
                    duration_hours: rows[0].duration_hours,
                    payment_status: rows[0].payment_status,
                    status: rows[0].status
                };
            }
        } else if (type === 'food') {
            const [rows] = await db.execute(
                `SELECT * FROM food_orders WHERE id = ?`,
                [id]
            );
            if (rows.length > 0) {
                booking = {
                    id: rows[0].id,
                    totalPrice: Number(rows[0].total_amount),
                    payment_status: rows[0].payment_status,
                    status: rows[0].status
                };
            }
        }

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit Payment (CBE or Telebirr with optional/required receipt upload)
router.post('/cbe-payment', auth, async (req, res) => {
    // OLD receipt + transaction-ID payment is removed.
    // Use account transfer: POST /api/payments/transfer-pay
    return res.status(410).json({
        success: false,
        message: 'Screenshot/transaction-ID payment is no longer supported. Use account payment: select hotel bank, query balance with your registration full name and account username, then pay.',
        useEndpoint: '/api/payments/transfer-pay'
    });
});


router.get('/pending', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const [payments] = await db.execute(
            `SELECT p.*, c.first_name, c.last_name, c.email, c.phone, c.id_card_image
             FROM payments p
             LEFT JOIN customers c ON p.customer_id = c.id
             WHERE p.status = 'pending'
             ORDER BY p.transaction_date DESC`
        );
        res.json({ success: true, payments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Receptionist action on payment (Approve/Verify or Reject)
router.post('/:id/action', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const { action, rejectionReason } = req.body;
        const paymentId = req.params.id;

        const [pRows] = await db.execute('SELECT * FROM payments WHERE id = ?', [paymentId]);
        if (pRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Payment record not found' });
        }
        const payment = pRows[0];

        if (action === 'approve') {
            // Mark payment verified
            await db.execute(
                `UPDATE payments SET status = 'approved', verified_by = ?, verified_at = NOW() WHERE id = ?`,
                [req.user.id, paymentId]
            );

            // Approving payment automatically approves reservation request and marks paid
            if (payment.reservation_type === 'room' && payment.reservation_id) {
                await db.execute(
                    `UPDATE room_reservations SET status = 'approved', payment_status = 'paid' WHERE id = ?`,
                    [payment.reservation_id]
                );
                // Mark room unavailable
                const [rRows] = await db.execute('SELECT room_id FROM room_reservations WHERE id = ?', [payment.reservation_id]);
                if (rRows.length > 0) {
                    await db.execute('UPDATE rooms SET status = "booked" WHERE id = ?', [rRows[0].room_id]);
                }
            } else if (payment.reservation_type === 'desk' && payment.reservation_id) {
                await db.execute(
                    `UPDATE desk_reservations SET status = 'approved', payment_status = 'paid' WHERE id = ?`,
                    [payment.reservation_id]
                );
                const [dRows] = await db.execute('SELECT desk_id FROM desk_reservations WHERE id = ?', [payment.reservation_id]);
                if (dRows.length > 0) {
                    await db.execute('UPDATE desks SET status = "reserved" WHERE id = ?', [dRows[0].desk_id]);
                }
            } else if (payment.reservation_type === 'food' && payment.reservation_id) {
                await db.execute(
                    `UPDATE food_orders SET status = 'approved', payment_status = 'paid' WHERE id = ?`,
                    [payment.reservation_id]
                );
            }

            await logAuditAction(req.user.id, req.user.role, 'APPROVE_PAYMENT', payment.reservation_type, payment.reservation_id, {
                paymentId,
                amount: payment.amount,
                transactionId: payment.transaction_id
            });

            const custUserId = await getUserIdForCustomer(payment.customer_id);
            await notifyUser(custUserId, {
                type: 'payment_approved',
                title: 'Payment Verified & Approved',
                message: `Your payment of ETB ${payment.amount} (Tx ID: ${payment.transaction_id}) has been verified. Your ${payment.reservation_type} reservation is now CONFIRMED.`,
                link: '/dashboard/customer'
            });

            // Get customer email
            const [cRows] = await db.execute('SELECT email FROM customers WHERE id = ?', [payment.customer_id]);
            if (cRows.length > 0) {
                sendNotificationEmail(
                    cRows[0].email,
                    'Payment Verified - Reservation Approved',
                    `Your payment of ETB ${payment.amount} has been verified by our receptionist. Your ${payment.reservation_type} reservation #${payment.reservation_id} is now Approved.`
                );
            }

            res.json({ success: true, message: 'Payment verified and reservation approved successfully!' });
        } else if (action === 'reject') {
            await db.execute(
                `UPDATE payments SET status = 'rejected', rejection_reason = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
                [rejectionReason || 'Invalid transaction reference', req.user.id, paymentId]
            );

            // Update reservation status to rejected
            if (payment.reservation_type === 'room' && payment.reservation_id) {
                await db.execute(
                    `UPDATE room_reservations SET status = 'rejected', rejection_reason = ?, payment_status = 'failed' WHERE id = ?`,
                    [rejectionReason || 'Payment rejected', payment.reservation_id]
                );
            } else if (payment.reservation_type === 'desk' && payment.reservation_id) {
                await db.execute(
                    `UPDATE desk_reservations SET status = 'rejected', rejection_reason = ?, payment_status = 'failed' WHERE id = ?`,
                    [rejectionReason || 'Payment rejected', payment.reservation_id]
                );
            } else if (payment.reservation_type === 'food' && payment.reservation_id) {
                await db.execute(
                    `UPDATE food_orders SET status = 'cancelled', rejection_reason = ?, payment_status = 'failed' WHERE id = ?`,
                    [rejectionReason || 'Payment rejected', payment.reservation_id]
                );
            }

            await logAuditAction(req.user.id, req.user.role, 'REJECT_PAYMENT', payment.reservation_type, payment.reservation_id, {
                paymentId,
                rejectionReason
            });

            const custUserId = await getUserIdForCustomer(payment.customer_id);
            await notifyUser(custUserId, {
                type: 'payment_rejected',
                title: 'Payment Verification Failed',
                message: `Your payment for ${payment.reservation_type} #${payment.reservation_id} was rejected: ${rejectionReason || 'Invalid transaction verification'}. Please re-submit payment or contact support.`,
                link: '/dashboard/customer'
            });

            const [cRows] = await db.execute('SELECT email FROM customers WHERE id = ?', [payment.customer_id]);
            if (cRows.length > 0) {
                sendNotificationEmail(
                    cRows[0].email,
                    'Payment Verification Failed',
                    `Your payment verification failed. Reason: ${rejectionReason || 'Invalid transaction reference'}. Please check your receipt and resubmit.`
                );
            }

            res.json({ success: true, message: 'Payment rejected and customer notified' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        console.error('Payment action error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// Get all payments (receptionist/admin) with filters + reservation dates
router.get('/', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const { status, method, q, from, to, checkIn, checkOut } = req.query;
        let sql = `SELECT p.*, 
                   COALESCE(c.first_name, u.first_name) as first_name,
                   COALESCE(c.last_name, u.last_name) as last_name,
                   COALESCE(c.email, u.email) as email,
                   COALESCE(c.phone, u.phone) as phone,
                   u.username,
                   c.id_card_image,
                   rr.check_in_date,
                   rr.check_out_date,
                   rm.room_number,
                   rm.room_type,
                   dk.desk_number,
                   dk.location AS desk_location,
                   dr.reservation_date AS desk_reservation_date,
                   dr.start_time AS desk_start_time,
                   dr.end_time AS desk_end_time
            FROM payments p
            LEFT JOIN customers c ON p.customer_id = c.id
            LEFT JOIN users u ON (c.user_id = u.id OR p.customer_id = u.id)
            LEFT JOIN room_reservations rr
                   ON (p.reservation_id = rr.id AND (LOWER(COALESCE(p.reservation_type, p.payment_type, '')) LIKE '%room%' OR COALESCE(p.reservation_type, p.payment_type, '') = ''))
                   OR (p.reference_number IS NOT NULL AND p.reference_number <> '' AND p.reference_number = rr.payment_reference)
            LEFT JOIN rooms rm ON rr.room_id = rm.id
            LEFT JOIN desk_reservations dr
                   ON (p.reservation_id = dr.id AND LOWER(COALESCE(p.reservation_type, p.payment_type, '')) LIKE '%desk%')
                   OR (p.reference_number IS NOT NULL AND p.reference_number <> '' AND p.reference_number = dr.payment_reference)
            LEFT JOIN desks dk ON dr.desk_id = dk.id
            WHERE 1=1`;
        const params = [];
        if (status) {
            sql += ' AND LOWER(p.status) = LOWER(?)';
            params.push(status);
        }
        if (method) {
            // Flexible match: payment_method is often the bank name (e.g. Commercial Bank of Ethiopia)
            const m = String(method).toLowerCase();
            if (m === 'cbe' || m === 'cbe_birr') {
                sql += ` AND (LOWER(COALESCE(p.payment_method,'')) LIKE '%cbe%'
                          OR LOWER(COALESCE(p.payment_method,'')) LIKE '%commercial bank%')`;
            } else if (m === 'telebirr') {
                sql += ` AND LOWER(COALESCE(p.payment_method,'')) LIKE '%telebirr%'`;
            } else if (m === 'cash') {
                sql += ` AND LOWER(COALESCE(p.payment_method,'')) LIKE '%cash%'`;
            } else if (m === 'bank_transfer' || m === 'bank') {
                sql += ` AND (
                    LOWER(COALESCE(p.payment_method,'')) LIKE '%bank%'
                    OR LOWER(COALESCE(p.payment_method,'')) LIKE '%transfer%'
                    OR LOWER(COALESCE(p.payment_method,'')) LIKE '%cbe%'
                    OR LOWER(COALESCE(p.payment_method,'')) LIKE '%commercial%'
                )`;
            } else {
                sql += ` AND LOWER(COALESCE(p.payment_method,'')) LIKE ?`;
                params.push('%' + m + '%');
            }
        }
        if (from) { sql += ' AND DATE(p.transaction_date) >= ?'; params.push(from); }
        if (to) { sql += ' AND DATE(p.transaction_date) <= ?'; params.push(to); }
        if (checkIn && checkOut) {
            sql += ` AND (
                (DATE(rr.check_in_date) >= ? AND DATE(rr.check_out_date) <= ?)
                OR (DATE(dr.reservation_date) >= ? AND DATE(dr.reservation_date) <= ?)
                OR (DATE(dr.start_time) >= ? AND DATE(dr.end_time) <= ?)
            )`;
            params.push(checkIn, checkOut, checkIn, checkOut, checkIn, checkOut);
        } else if (checkIn) {
            sql += ` AND (
                DATE(rr.check_in_date) = ?
                OR DATE(dr.reservation_date) = ?
                OR DATE(dr.start_time) = ?
            )`;
            params.push(checkIn, checkIn, checkIn);
        } else if (checkOut) {
            sql += ` AND (
                DATE(rr.check_out_date) = ?
                OR DATE(dr.reservation_date) = ?
                OR DATE(dr.end_time) = ?
            )`;
            params.push(checkOut, checkOut, checkOut);
        }
        if (q) {
            sql += ` AND (
                p.reference_number LIKE ?
                OR p.transaction_id LIKE ?
                OR COALESCE(c.first_name,'') LIKE ?
                OR COALESCE(c.last_name,'') LIKE ?
                OR CONCAT(COALESCE(c.first_name,''), ' ', COALESCE(c.last_name,'')) LIKE ?
                OR COALESCE(u.first_name,'') LIKE ?
                OR COALESCE(u.last_name,'') LIKE ?
                OR CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) LIKE ?
                OR COALESCE(c.email, u.email, '') LIKE ?
                OR COALESCE(c.phone, u.phone, '') LIKE ?
                OR COALESCE(u.username, '') LIKE ?
                OR COALESCE(rm.room_number, '') LIKE ?
                OR COALESCE(dk.desk_number, '') LIKE ?
                OR COALESCE(p.payment_method, '') LIKE ?
            )`;
            const like = '%' + q + '%';
            params.push(like, like, like, like, like, like, like, like, like, like, like, like, like, like);
        }
        sql += ' ORDER BY p.transaction_date DESC LIMIT 500';
        const [payments] = await db.execute(sql, params);
        const mapped = payments.map(p => ({
            ...p,
            room_number: p.room_number || null,
            desk_number: p.desk_number || null,
            check_in_date: p.check_in_date || null,
            check_out_date: p.check_out_date || null,
            desk_reservation_date: p.desk_reservation_date || null,
            receipt_image: p.receipt_image
                ? (String(p.receipt_image).startsWith('/uploads') || String(p.receipt_image).startsWith('http')
                    ? p.receipt_image
                    : '/uploads/receipts/' + String(p.receipt_image).replace(/^.*[\\/]/, ''))
                : null
        }));
        res.json({ success: true, payments: mapped });
    } catch (error) {
        console.error('GET /payments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single payment with full details
router.get('/customers/search', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let rows;
        if (!q) {
            // Default: list customers for receptionist (no password fields)
            const [all] = await db.execute(
                `SELECT c.id, c.user_id, c.first_name, c.last_name, c.email, c.phone, c.address,
                        c.country, c.region, c.zone, c.wereda, c.kebele, c.sex, c.age,
                        c.registration_date, c.id_card_image, u.username, u.role
                 FROM customers c
                 LEFT JOIN users u ON c.user_id = u.id
                 ORDER BY c.registration_date DESC LIMIT 100`
            );
            rows = all;
        } else {
            const like = '%' + q + '%';
            const [found] = await db.execute(
                `SELECT c.id, c.user_id, c.first_name, c.last_name, c.email, c.phone, c.address,
                        c.country, c.region, c.zone, c.wereda, c.kebele, c.sex, c.age,
                        c.registration_date, c.id_card_image, u.username, u.role
                 FROM customers c
                 LEFT JOIN users u ON c.user_id = u.id
                 WHERE c.first_name LIKE ? OR c.last_name LIKE ?
                    OR c.email LIKE ? OR c.phone LIKE ?
                    OR CAST(c.id AS CHAR) LIKE ? OR COALESCE(u.username,'') LIKE ?
                 ORDER BY c.registration_date DESC LIMIT 50`,
                [like, like, like, like, like, like]
            );
            rows = found;
        }
        const customers = [];
        for (const c of rows) {
            const [[rooms]] = await db.execute('SELECT COUNT(*) as n FROM room_reservations WHERE customer_id = ?', [c.id]);
            const [[desks]] = await db.execute('SELECT COUNT(*) as n FROM desk_reservations WHERE customer_id = ?', [c.id]);
            const [[foods]] = await db.execute('SELECT COUNT(*) as n FROM food_orders WHERE customer_id = ?', [c.id]);
            const [[pays]] = await db.execute(
                'SELECT COUNT(*) as n, COALESCE(SUM(CASE WHEN status IN ("approved","verified","completed") THEN amount ELSE 0 END),0) as total FROM payments WHERE customer_id = ?',
                [c.id]
            );
            let idImg = c.id_card_image;
            if (idImg) {
                idImg = String(idImg).replace(/\\/g, '/');
                if (!idImg.startsWith('http') && !idImg.startsWith('/uploads')) {
                    idImg = '/uploads/id_cards/' + idImg.replace(/^.*[/\\]/, '');
                } else if (idImg.startsWith('uploads/')) {
                    idImg = '/' + idImg.replace(/^\/+/, '');
                }
            }
            let idBack = c.id_card_back_image;
            if (idBack) {
                idBack = String(idBack).replace(/\\/g, '/');
                if (!idBack.startsWith('http') && !idBack.startsWith('/uploads')) {
                    idBack = '/uploads/id_cards/' + idBack.replace(/^.*[/\\]/, '');
                } else if (idBack.startsWith('uploads/')) {
                    idBack = '/' + idBack.replace(/^\/+/, '');
                }
            }
            if (!idBack || !idImg) {
                try {
                    const [rr] = await db.execute(
                        'SELECT id_card_back_image, id_card_image FROM room_reservations WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
                        [c.id]
                    );
                    if (rr.length) {
                        if (!idImg && rr[0].id_card_image) {
                            let f = String(rr[0].id_card_image).replace(/\\/g, '/');
                            if (!f.startsWith('http') && !f.startsWith('/uploads')) {
                                f = '/uploads/id_cards/' + f.replace(/^.*[/\\]/, '');
                            }
                            idImg = f;
                        }
                        if (!idBack && rr[0].id_card_back_image) {
                            let b = String(rr[0].id_card_back_image).replace(/\\/g, '/');
                            if (!b.startsWith('http') && !b.startsWith('/uploads')) {
                                b = '/uploads/id_cards/' + b.replace(/^.*[/\\]/, '');
                            }
                            idBack = b;
                        }
                    }
                } catch (_) { }
            }
            customers.push({
                ...c,
                id_card_image: idImg || c.id_card_image || null,
                id_card_back_image: idBack || null,
                reservations_count: rooms.n,
                desk_reservations_count: desks.n,
                food_orders_count: foods.n,
                payments_count: pays.n,
                total_paid: pays.total
            });
        }
        res.json({ success: true, customers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Customer detail with history
router.get('/customers/:id/history', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT c.*, u.username, u.role FROM customers c
             LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
        const customer = rows[0];
        const [roomRes] = await db.execute(
            `SELECT r.*, rm.room_number, rm.room_type FROM room_reservations r
             LEFT JOIN rooms rm ON r.room_id = rm.id WHERE r.customer_id = ? ORDER BY r.reservation_date DESC LIMIT 20`,
            [customer.id]
        );
        const [deskRes] = await db.execute(
            `SELECT d.*, dk.desk_number FROM desk_reservations d
             LEFT JOIN desks dk ON d.desk_id = dk.id WHERE d.customer_id = ? ORDER BY d.created_at DESC LIMIT 20`,
            [customer.id]
        );
        const [foodRes] = await db.execute(
            'SELECT * FROM food_orders WHERE customer_id = ? ORDER BY order_date DESC LIMIT 20',
            [customer.id]
        );
        const [payRes] = await db.execute(
            'SELECT * FROM payments WHERE customer_id = ? ORDER BY transaction_date DESC LIMIT 30',
            [customer.id]
        );
        const normIdPath = (val) => {
            if (!val) return null;
            let idCard = String(val).replace(/\\/g, '/').trim();
            if (!idCard || idCard === 'undefined' || idCard === 'null') return null;
            if (!idCard.startsWith('http') && !idCard.startsWith('/uploads')) {
                const file = idCard.replace(/^.*[/\\]/, '');
                idCard = '/uploads/id_cards/' + file;
            } else if (idCard.startsWith('uploads/')) {
                idCard = '/' + idCard.replace(/^\/+/, '');
            }
            return idCard;
        };

        // Front + back ID: customer record, then latest room reservation
        let idCard = normIdPath(customer.id_card_image || customer.id_card);
        let idCardBack = normIdPath(customer.id_card_back_image);
        if (!idCard && roomRes.length) {
            const withId = roomRes.find((r) => r.id_card_image);
            if (withId) idCard = normIdPath(withId.id_card_image);
        }
        if (!idCardBack && roomRes.length) {
            const withBack = roomRes.find((r) => r.id_card_back_image);
            if (withBack) idCardBack = normIdPath(withBack.id_card_back_image);
        }
        customer.id_card_image = idCard;
        customer.id_card_url = idCard;
        customer.id_card_back_image = idCardBack;
        customer.id_card_back_url = idCardBack;

        const roomsNorm = roomRes.map((r) => ({
            ...r,
            id_card_image: normIdPath(r.id_card_image) || r.id_card_image,
            id_card_back_image: normIdPath(r.id_card_back_image) || r.id_card_back_image,
        }));

        res.json({
            success: true,
            customer,
            id_card_url: idCard,
            id_card_back_url: idCardBack,
            room_reservations: roomsNorm,
            desk_reservations: deskRes,
            food_orders: foodRes,
            payments: payRes
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// Customer: own payment history only
router.get('/my-history', auth, async (req, res) => {
    try {
        const [cust] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        if (!cust.length) return res.json({ success: true, payments: [] });
        const [payments] = await db.execute(
            `SELECT p.id, p.reference_number, p.transaction_id, p.amount, p.payment_type,
                    p.payment_method, p.status, p.transaction_date, p.reservation_type, p.reservation_id,
                    p.account_number, p.account_name
             FROM payments p
             WHERE p.customer_id = ?
             ORDER BY p.transaction_date DESC
             LIMIT 200`,
            [cust[0].id]
        );
        res.json({ success: true, payments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT p.*,
                    COALESCE(c.first_name, u.first_name) as first_name,
                    COALESCE(c.last_name, u.last_name) as last_name,
                    COALESCE(c.email, u.email) as email,
                    COALESCE(c.phone, u.phone) as phone,
                    c.address, c.id_card_image, c.id as customer_table_id
             FROM payments p
             LEFT JOIN customers c ON p.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE p.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });
        const p = rows[0];
        if (p.receipt_image && !p.receipt_image.startsWith('/uploads') && !p.receipt_image.startsWith('http')) {
            p.receipt_image = '/uploads/receipts/' + p.receipt_image.replace(/^.*[\\/]/, '');
        }
        res.json({ success: true, payment: p });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



// Search customers (receptionist/admin/manager)

// === Account-based payment: debit customer, credit hotel ===
router.post('/transfer-pay', auth, async (req, res) => {
    try {
        const {
            type, id, hotelAccountId,
            fullName, accountUsername, confirmBalance
        } = req.body;

        if (!type || !id || !hotelAccountId) {
            return res.status(400).json({
                success: false,
                message: 'Hotel account and booking type/id are required'
            });
        }

        // Resolve booking amount and validate
        let amount = 0;
        let customerId = null;
        let booking = null;

        if (type === 'room') {
            const [rows] = await db.execute('SELECT * FROM room_reservations WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'Room reservation not found' });
            booking = rows[0];
            amount = Number(booking.total_price);
            customerId = booking.customer_id;
            if (booking.payment_status === 'paid') {
                return res.status(400).json({ success: false, message: 'Already paid' });
            }
        } else if (type === 'desk') {
            const [rows] = await db.execute('SELECT * FROM desk_reservations WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'Desk reservation not found' });
            booking = rows[0];
            amount = Number(booking.amount || 0);
            customerId = booking.customer_id;
            if (booking.payment_status === 'paid' || booking.is_free_with_food) {
                return res.status(400).json({ success: false, message: 'Already paid or free with food' });
            }
        } else if (type === 'food') {
            const [rows] = await db.execute('SELECT * FROM food_orders WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'Food order not found' });
            booking = rows[0];
            amount = Number(booking.total_amount);
            customerId = booking.customer_id;
            if (booking.payment_status === 'paid') {
                return res.status(400).json({ success: false, message: 'Already paid' });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid booking type' });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Nothing to pay' });
        }

        // Holder name comes from registration (logged-in user), not from client form
        const [userRows] = await db.execute(
            'SELECT first_name, last_name, username FROM users WHERE id = ?',
            [req.user.id]
        );
        const [custName] = await db.execute(
            'SELECT first_name, last_name FROM customers WHERE user_id = ?',
            [req.user.id]
        );
        const regFullName = (custName.length
            ? `${custName[0].first_name || ''} ${custName[0].last_name || ''}`.trim()
            : userRows.length
                ? `${userRows[0].first_name || ''} ${userRows[0].last_name || ''}`.trim()
                : ''
        );
        if (!regFullName) {
            return res.status(400).json({
                success: false,
                message: 'Registration full name is missing. Update your profile before paying.'
            });
        }
        // Account username = registration full name (not editable by customer on payment page)
        const payUsername = regFullName;

        // Prefer linked account for this customer; fallback match by registration name as username/holder
        let customerAccount = null;
        const [ownAcc] = await db.execute(
            `SELECT * FROM bank_accounts
             WHERE owner_type = 'customer' AND customer_id = ? AND is_active = 1
             ORDER BY is_primary DESC, id DESC LIMIT 1`,
            [customerId]
        );
        if (ownAcc.length) {
            customerAccount = ownAcc[0];
        } else {
            customerAccount = await BankAccount.findCustomerAccountByCredentials(payUsername, payUsername);
            if (!customerAccount && accountUsername) {
                customerAccount = await BankAccount.findCustomerAccountByCredentials(regFullName, accountUsername);
            }
        }
        if (!customerAccount) {
            return res.status(404).json({
                success: false,
                message: 'No bank account linked. Open My Accounts, link an account, then pay.'
            });
        }
        if (customerId && customerAccount.customer_id && Number(customerAccount.customer_id) !== Number(customerId)) {
            return res.status(403).json({ success: false, message: 'Account does not belong to this booking customer' });
        }

        const hotelAccount = await BankAccount.findById(hotelAccountId);
        if (!hotelAccount || hotelAccount.owner_type !== 'hotel' || !hotelAccount.is_active) {
            return res.status(400).json({ success: false, message: 'Invalid hotel account selected' });
        }

        // Transfer: customer -> hotel
        const tx = await BankAccount.transfer({
            fromAccountId: customerAccount.id,
            toAccountId: hotelAccount.id,
            amount,
            transactionType: 'payment',
            referenceType: type,
            referenceId: Number(id),
            description: `Payment for ${type} #${id}`,
            initiatedBy: req.user.id
        });

        const ref = 'TX-' + tx.transactionId + '-' + Date.now().toString(36).toUpperCase();

        // Update booking: room/desk confirmed immediately (no pending for customer)
        if (type === 'room') {
            await db.execute(
                `UPDATE room_reservations SET status = 'approved', payment_status = 'paid', payment_reference = ? WHERE id = ?`,
                [ref, id]
            );
            await db.execute('UPDATE rooms SET status = "booked" WHERE id = ?', [booking.room_id]);
        } else if (type === 'desk') {
            await db.execute(
                `UPDATE desk_reservations SET status = 'approved', payment_status = 'paid', payment_reference = ? WHERE id = ?`,
                [ref, id]
            );
            await db.execute('UPDATE desks SET status = "reserved" WHERE id = ?', [booking.desk_id]);
        } else if (type === 'food') {
            await db.execute(
                `UPDATE food_orders
                 SET payment_status = 'paid',
                     payment_reference = ?,
                     status = CASE
                       WHEN status IN ('waiting', 'ready', 'preparing') THEN status
                       ELSE 'preparing'
                     END
                 WHERE id = ?`,
                [ref, id]
            );
        }

        // Record in payments table for history
        await db.execute(
            `INSERT INTO payments
            (reference_number, customer_id, amount, payment_type, payment_method,
             account_number, account_name, transaction_id, reservation_type, reservation_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
            [
                ref, customerId, amount, type, hotelAccount.bank_name,
                hotelAccount.account_number, hotelAccount.account_holder_name,
                String(tx.transactionId), type, id
            ]
        );

        // Notify customer
        const custUserId = await getUserIdForCustomer(customerId);
        if (custUserId) {
            await notifyUser(custUserId, {
                type: 'payment_completed',
                title: 'Payment successful',
                message: type === 'food'
                    ? `Payment of ETB ${amount.toFixed(2)} received. Your food order is now being prepared.`
                    : `Payment of ETB ${amount.toFixed(2)} received. Your ${type} reservation is confirmed.`,
                link: '/dashboard/customer'
            });
        }

        res.json({
            success: true,
            message: 'Payment completed successfully',
            transactionId: tx.transactionId,
            reference: ref,
            amount
        });
    } catch (error) {
        console.error('transfer-pay error:', error);
        // Incomplete payment → reject room reservation (no pending wait state)
        try {
            if (req.body && req.body.type === 'room' && req.body.id) {
                await db.execute(
                    `UPDATE room_reservations
                     SET status = 'rejected', payment_status = 'failed',
                         rejection_reason = ?
                     WHERE id = ? AND (payment_status IS NULL OR payment_status != 'paid')`,
                    [String(error.message || 'Payment not completed').slice(0, 250), req.body.id]
                );
            }
        } catch (re) {
            console.error('reject unpaid room after pay fail:', re.message);
        }
        res.status(400).json({ success: false, message: error.message || 'Payment failed' });
    }
});


module.exports = router;
