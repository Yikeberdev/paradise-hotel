const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { uploadRoomImage, uploadDeskImage, uploadFoodImage } = require('../middleware/upload');

function normalizeMediaPath(val, folder) {
    if (!val) return null;
    let p = String(val).replace(/\\/g, '/').trim();
    if (!p || p === 'undefined' || p === 'null') return null;
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
    if (p.startsWith('/uploads/')) return p;
    if (p.startsWith('uploads/')) return '/' + p;
    // bare filename or relative
    const file = p.replace(/^.*[/\\]/, '');
    return `/uploads/${folder}/` + file;
}

const User = require('../models/User');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');

// All manager routes require auth + manager/admin role
router.use(auth, authorize('manager', 'admin'));

// ------------------------------------------
// USER MANAGEMENT
// ------------------------------------------
router.get('/users', async (req, res) => {
    try {
        const [users] = await db.execute(
            `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.role, u.status, 
                    u.profile_image, u.address, u.last_login, u.last_active, u.created_at
             FROM users u
             WHERE u.role = 'customer'
             ORDER BY u.created_at DESC`
        );
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/users/all', async (req, res) => {
    try {
        const [users] = await db.execute(
            `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.role, u.status, 
                    u.profile_image, u.address, u.last_login, u.last_active, u.created_at
             FROM users u ORDER BY u.created_at DESC`
        );
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/users/:id/status', async (req, res) => {
    try {
        const { status, reason } = req.body;
        if (!['active', 'suspended', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        await User.updateStatus(req.params.id, status);

        await notifyUser(parseInt(req.params.id), {
            type: 'account_status',
            title: 'Account Status Updated',
            message: `Your account status has been changed to "${status}".${reason ? ` Reason: ${reason}` : ''}`,
            link: '/'
        });

        res.json({ success: true, message: `User status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user reservation + payment history
router.get('/users/:id/history', async (req, res) => {
    try {
        const userId = req.params.id;

        const [customer] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [userId]);
        if (customer.length === 0) {
            return res.json({ success: true, roomReservations: [], deskReservations: [], foodOrders: [], payments: [] });
        }
        const customerId = customer[0].id;

        const [rooms] = await db.execute(
            `SELECT rr.*, r.room_number, r.room_type FROM room_reservations rr 
             LEFT JOIN rooms r ON rr.room_id = r.id 
             WHERE rr.customer_id = ? ORDER BY rr.reservation_date DESC`,
            [customerId]
        );
        const [desks] = await db.execute(
            `SELECT dr.*, d.desk_number FROM desk_reservations dr 
             LEFT JOIN desks d ON dr.desk_id = d.id 
             WHERE dr.customer_id = ? ORDER BY dr.created_at DESC`,
            [customerId]
        );
        const [food] = await db.execute(
            `SELECT fo.* FROM food_orders fo WHERE fo.customer_id = ? ORDER BY fo.order_date DESC`,
            [customerId]
        );
        const [payments] = await db.execute(
            `SELECT p.* FROM payments p WHERE p.customer_id = ? ORDER BY p.transaction_date DESC`,
            [customerId]
        );

        res.json({ success: true, roomReservations: rooms, deskReservations: desks, foodOrders: food, payments });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ------------------------------------------
// DISCOUNT MANAGEMENT
// ------------------------------------------
router.get('/discounts', async (req, res) => {
    try {
        const [discounts] = await db.execute(
            `SELECT d.*, u.username as created_by_name 
             FROM discounts d LEFT JOIN users u ON d.created_by = u.id 
             ORDER BY d.created_at DESC`
        );
        // Auto-update is_active based on current date/time
        const now = new Date();
        for (const d of discounts) {
            const start = new Date(`${d.start_date}T${d.start_time}`);
            const end = new Date(`${d.end_date}T${d.end_time}`);
            const shouldBeActive = now >= start && now <= end;
            if (d.is_active !== (shouldBeActive ? 1 : 0)) {
                await db.execute('UPDATE discounts SET is_active = ? WHERE id = ?', [shouldBeActive ? 1 : 0, d.id]);
                d.is_active = shouldBeActive ? 1 : 0;
            }
        }
        res.json({ success: true, discounts });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/discounts', async (req, res) => {
    try {
        const { discountPercentage, discountType, targetCategory, startDate, endDate, startTime, endTime } = req.body;

        if (!discountPercentage || !discountType || !startDate || !endDate) {
            return res.status(400).json({ message: 'Missing required discount fields' });
        }

        if (!['food', 'room', 'desk', 'all'].includes(discountType)) {
            return res.status(400).json({ message: 'Invalid discount type' });
        }

        const [result] = await db.execute(
            `INSERT INTO discounts (discount_percentage, discount_type, target_category, start_date, end_date, start_time, end_time, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Number(discountPercentage),
                discountType,
                targetCategory || null,
                startDate,
                endDate,
                startTime || '00:00:00',
                endTime || '23:59:59',
                req.user.id
            ]
        );

        // Notify all customers about the discount
        const [customers] = await db.execute("SELECT id FROM users WHERE role = 'customer' AND status = 'active'");
        for (const c of customers) {
            await notifyUser(c.id, {
                type: 'discount_available',
                title: 'New Discount Available!',
                message: `A new ${discountPercentage}% discount on ${discountType === 'all' ? 'all services' : discountType} is now available!`,
                link: '/'
            });
        }

        res.status(201).json({ success: true, message: 'Discount created successfully', id: result.insertId });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/discounts/:id', async (req, res) => {
    try {
        const { discountPercentage, discountType, targetCategory, startDate, endDate, startTime, endTime, isActive } = req.body;
        await db.execute(
            `UPDATE discounts SET discount_percentage=?, discount_type=?, target_category=?, 
             start_date=?, end_date=?, start_time=?, end_time=?, is_active=? WHERE id=?`,
            [
                Number(discountPercentage), discountType, targetCategory || null,
                startDate, endDate, startTime || '00:00:00', endTime || '23:59:59',
                isActive !== undefined ? (isActive ? 1 : 0) : 1,
                req.params.id
            ]
        );
        res.json({ success: true, message: 'Discount updated' });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/discounts/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM discounts WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Discount deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ------------------------------------------
// CANCELLATION PENALTY
// ------------------------------------------
router.get('/refunds/pending', async (req, res) => {
    try {
        const [refunds] = await db.execute(
            `SELECT rr.*, 
                    c.first_name, c.last_name, c.email,
                    u.username
             FROM refund_requests rr
             LEFT JOIN customers c ON rr.customer_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE rr.status = 'pending'
             ORDER BY rr.created_at DESC`
        );
        res.json({ success: true, refunds });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/refunds/:id/process', async (req, res) => {
    try {
        const { action, penaltyPercentage, refundAmount, reason } = req.body;
        const refundId = req.params.id;

        const [rows] = await db.execute('SELECT * FROM refund_requests WHERE id = ?', [refundId]);
        const refund = rows[0];
        if (!refund) return res.status(404).json({ message: 'Refund request not found' });

        const penalty = Number(penaltyPercentage || refund.penalty_percentage);
        const penaltyAmt = (refund.original_amount * penalty) / 100;
        const refundAmt = Number(refundAmount || (refund.original_amount - penaltyAmt));

        if (action === 'approve') {
            await db.execute(
                `UPDATE refund_requests SET 
                 status = 'approved', penalty_percentage = ?, penalty_amount = ?, refund_amount = ?,
                 reason = ?, processed_by = ?, processed_at = NOW()
                 WHERE id = ?`,
                [penalty, penaltyAmt, refundAmt, reason || refund.reason, req.user.id, refundId]
            );

            const custUserId = await getUserIdForCustomer(refund.customer_id);
            await notifyUser(custUserId, {
                type: 'refund_approved',
                title: 'Refund Approved',
                message: `Your refund request has been approved. Refund amount: ETB ${refundAmt.toFixed(2)}${penalty > 0 ? ` (${penalty}% cancellation penalty applied)` : ''}.`,
                link: '/dashboard/customer'
            });

            res.json({ success: true, message: 'Refund processed', refundAmount: refundAmt });
        } else if (action === 'reject') {
            await db.execute(
                `UPDATE refund_requests SET status = 'rejected', reason = ?, processed_by = ?, processed_at = NOW() WHERE id = ?`,
                [reason || 'Rejected by manager', req.user.id, refundId]
            );

            const custUserId = await getUserIdForCustomer(refund.customer_id);
            await notifyUser(custUserId, {
                type: 'refund_rejected',
                title: 'Refund Request Rejected',
                message: `Your refund request has been rejected. Reason: ${reason || 'Manager decision'}.`,
                link: '/dashboard/customer'
            });

            res.json({ success: true, message: 'Refund rejected' });
        } else {
            res.status(400).json({ message: 'Invalid action' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ------------------------------------------
// DELETE APPROVAL REQUESTS (Manager sends to Admin)
// ------------------------------------------


// ------------------------------------------
// REPORTS (for manager view)
// ------------------------------------------
router.get('/reports', async (req, res) => {
    try {
        const [rooms] = await db.execute(
            `SELECT rr.*, r.room_number, r.room_type, c.first_name, c.last_name
             FROM room_reservations rr
             LEFT JOIN rooms r ON rr.room_id = r.id
             LEFT JOIN customers c ON rr.customer_id = c.id
             ORDER BY rr.reservation_date DESC LIMIT 100`
        );
        const [desks] = await db.execute(
            `SELECT dr.*, d.desk_number, c.first_name, c.last_name
             FROM desk_reservations dr
             LEFT JOIN desks d ON dr.desk_id = d.id
             LEFT JOIN customers c ON dr.customer_id = c.id
             ORDER BY dr.created_at DESC LIMIT 100`
        );
        const [food] = await db.execute(
            `SELECT fo.*, c.first_name, c.last_name
             FROM food_orders fo
             LEFT JOIN customers c ON fo.customer_id = c.id
             ORDER BY fo.order_date DESC LIMIT 100`
        );
        const [payments] = await db.execute(
            `SELECT p.*, c.first_name, c.last_name
             FROM payments p
             LEFT JOIN customers c ON p.customer_id = c.id
             ORDER BY p.transaction_date DESC LIMIT 100`
        );

        const [[pendingRooms]] = await db.execute("SELECT COUNT(*) as n FROM room_reservations WHERE status='pending'");
        const [[pendingDesks]] = await db.execute("SELECT COUNT(*) as n FROM desk_reservations WHERE status='pending'");
        const [[pendingFood]] = await db.execute("SELECT COUNT(*) as n FROM food_orders WHERE status='pending'");
        const [[pendingPayments]] = await db.execute("SELECT COUNT(*) as n FROM payments WHERE status='pending'");
        const [[totalRevenue]] = await db.execute("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status IN ('approved','verified','completed')");

        res.json({
            success: true,
            summary: {
                pendingRoomReservations: pendingRooms.n,
                pendingDeskReservations: pendingDesks.n,
                pendingFoodOrders: pendingFood.n,
                pendingPayments: pendingPayments.n,
                totalRevenue: totalRevenue.total
            },
            rooms,
            desks,
            food,
            payments
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Stats for manager dashboard
router.get('/stats', async (req, res) => {
    try {
        const [[roomStats]] = await db.execute('SELECT COUNT(*) as total, SUM(status="available") as available FROM rooms');
        const [[revStats]] = await db.execute("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status IN ('approved','verified','completed')");
        const [[totalRes]] = await db.execute('SELECT COUNT(*) as total FROM room_reservations');
        const [[custStats]] = await db.execute("SELECT COUNT(*) as total FROM users WHERE role='customer'");

        res.json({
            success: true,
            stats: {
                totalRooms: roomStats.total || 0,
                availableRooms: roomStats.available || 0,
                totalRevenue: revStats.total || 0,
                totalReservations: totalRes.total || 0,
                totalCustomers: custStats.total || 0
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ========== RESOURCE MANAGEMENT (Manager) ==========
router.get('/employees', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT e.*, u.username, u.email as user_email, u.role, u.first_name, u.last_name
             FROM employees e LEFT JOIN users u ON e.user_id = u.id ORDER BY e.id DESC`
        );
        res.json({ success: true, employees: rows });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/employees', async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const { firstName, lastName, email, phone, password, role, position, salary } = req.body;
        if (!email || !password || !firstName) {
            return res.status(400).json({ message: 'First name, email and password are required' });
        }
        const emailNorm = String(email).trim().toLowerCase();
        let username = emailNorm;
        const [emailDup] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [emailNorm]);
        if (emailDup.length) return res.status(400).json({ message: 'Email already in use' });
        const [userDup] = await db.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
        if (userDup.length) {
            username = emailNorm.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now().toString(36);
        }
        const hash = await bcrypt.hash(password, 10);
        const [u] = await db.execute(
            `INSERT INTO users (username, email, first_name, last_name, phone, password, role) VALUES (?,?,?,?,?,?,?)`,
            [username, emailNorm, firstName, lastName || '', phone || '', hash, role || 'receptionist']
        );
        await db.execute(
            `INSERT INTO employees (user_id, full_name, position, salary, email, phone, address) VALUES (?,?,?,?,?,?,?)`,
            [u.insertId, `${firstName} ${lastName || ''}`.trim(), position || role || 'staff', salary || 0, emailNorm, phone || '', '']
        );
        res.status(201).json({ success: true, message: 'Employee created' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/employees/:id', async (req, res) => {
    try {
        const { full_name, position, salary, email, phone, address, status } = req.body;
        await db.execute(
            `UPDATE employees SET full_name=COALESCE(?,full_name), position=COALESCE(?,position), salary=COALESCE(?,salary),
             email=COALESCE(?,email), phone=COALESCE(?,phone), address=COALESCE(?,address), status=COALESCE(?,status) WHERE id=?`,
            [full_name, position, salary, email, phone, address, status, req.params.id]
        );
        res.json({ success: true, message: 'Employee updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/employees/:id', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT user_id FROM employees WHERE id = ?', [req.params.id]);
        await db.execute('DELETE FROM employees WHERE id = ?', [req.params.id]);
        if (rows.length && rows[0].user_id) await db.execute('DELETE FROM users WHERE id = ?', [rows[0].user_id]);
        res.json({ success: true, message: 'Employee deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/rooms', uploadRoomImage.single('image'), async (req, res) => {
    try {
        const { roomNumber, type, price, capacity, description, amenities, status } = req.body;
        let image = req.body.image || null;
        if (req.file) image = '/uploads/rooms/' + req.file.filename;
        image = normalizeMediaPath(image, 'rooms') || '/uploads/rooms/room-default.jpg';
        const [r] = await db.execute(
            `INSERT INTO rooms (room_number, room_type, price_per_night, capacity, description, amenities, image, status)
             VALUES (?,?,?,?,?,?,?,?)`,
            [roomNumber, type || 'Single', price || 0, capacity || 2, description || '', amenities || '', image, status || 'available']
        );
        res.status(201).json({ success: true, id: r.insertId, image });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/rooms/:id', uploadRoomImage.single('image'), async (req, res) => {
    try {
        const { roomNumber, type, price, capacity, description, amenities, status } = req.body;
        let image = req.body.image;
        if (req.file) image = '/uploads/rooms/' + req.file.filename;
        if (image) image = normalizeMediaPath(image, 'rooms');
        await db.execute(
            `UPDATE rooms SET room_number=COALESCE(?,room_number), room_type=COALESCE(?,room_type), price_per_night=COALESCE(?,price_per_night),
             capacity=COALESCE(?,capacity), description=COALESCE(?,description), amenities=COALESCE(?,amenities),
             image=COALESCE(?,image), status=COALESCE(?,status) WHERE id=?`,
            [roomNumber || null, type || null, price || null, capacity || null, description || null, amenities || null, image || null, status || null, req.params.id]
        );
        res.json({ success: true, image: image || undefined });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/rooms/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM rooms WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/desks', uploadDeskImage.single('image'), async (req, res) => {
    try {
        const { deskNumber, capacity, location, price, description, status } = req.body;
        let image = req.body.image || null;
        if (req.file) image = '/uploads/desks/' + req.file.filename;
        image = normalizeMediaPath(image, 'desks') || '/uploads/desks/desk-default.jpg';
        const [r] = await db.execute(
            `INSERT INTO desks (desk_number, capacity, location, price, description, status, image) VALUES (?,?,?,?,?,?,?)`,
            [deskNumber, capacity || 2, location || 'Main Hall', price || 0, description || '', status || 'available', image]
        );
        res.status(201).json({ success: true, id: r.insertId, image });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/desks/:id', uploadDeskImage.single('image'), async (req, res) => {
    try {
        const { deskNumber, capacity, location, price, description, status } = req.body;
        let image = req.body.image;
        if (req.file) image = '/uploads/desks/' + req.file.filename;
        if (image) image = normalizeMediaPath(image, 'desks');
        await db.execute(
            `UPDATE desks SET desk_number=COALESCE(?,desk_number), capacity=COALESCE(?,capacity), location=COALESCE(?,location),
             price=COALESCE(?,price), description=COALESCE(?,description), image=COALESCE(?,image), status=COALESCE(?,status) WHERE id=?`,
            [deskNumber || null, capacity || null, location || null, price ?? null, description || null, image || null, status || null, req.params.id]
        );
        res.json({ success: true, image: image || undefined });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/desks/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM desks WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/food', uploadFoodImage.single('image'), async (req, res) => {
    try {
        const { name, category, price, description, availability } = req.body;
        let image = req.body.image || null;
        if (req.file) image = '/uploads/foods/' + req.file.filename;
        image = normalizeMediaPath(image, 'foods') || '/uploads/foods/food-default.jpg';
        const [r] = await db.execute(
            `INSERT INTO food_menu (item_name, category, price, description, image, availability) VALUES (?,?,?,?,?,?)`,
            [name, category || 'Main Course', price || 0, description || '', image, availability || 'available']
        );
        res.status(201).json({ success: true, id: r.insertId, image });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/food/:id', uploadFoodImage.single('image'), async (req, res) => {
    try {
        const { name, category, price, description, availability, is_hidden } = req.body;
        try {
            await db.execute('ALTER TABLE food_menu ADD COLUMN is_hidden TINYINT(1) DEFAULT 0');
        } catch (_) { }
        let image = req.body.image;
        if (req.file) image = '/uploads/foods/' + req.file.filename;
        if (image) image = normalizeMediaPath(image, 'foods');

        await db.execute(
            `UPDATE food_menu SET item_name=COALESCE(?,item_name), category=COALESCE(?,category), price=COALESCE(?,price),
             description=COALESCE(?,description), image=COALESCE(?,image), availability=COALESCE(?,availability) WHERE id=?`,
            [name || null, category || null, price ?? null, description || null, image || null, availability || null, req.params.id]
        );
        if (is_hidden !== undefined && is_hidden !== null) {
            await db.execute('UPDATE food_menu SET is_hidden = ? WHERE id = ?', [is_hidden ? 1 : 0, req.params.id]);
        }
        res.json({ success: true, message: 'Food updated', image: image || undefined });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Dedicated hide/show for manager UI
router.put('/food/:id/visibility', async (req, res) => {
    try {
        const hidden = req.body.hidden === true || req.body.hidden === 1 || req.body.hidden === '1' || req.body.is_hidden ? 1 : 0;
        try {
            await db.execute('ALTER TABLE food_menu ADD COLUMN is_hidden TINYINT(1) DEFAULT 0');
        } catch (_) { }
        await db.execute('UPDATE food_menu SET is_hidden = ? WHERE id = ?', [hidden, req.params.id]);
        res.json({ success: true, is_hidden: hidden, message: hidden ? 'Hidden from customers' : 'Visible to customers' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/food/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM food_menu WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});



// Cancellation penalties by type (room / desk / food) — percentage applied on refund requests
router.get('/penalties', async (req, res) => {
    try {
        const Refund = require('../models/Refund');
        const penalties = await Refund.listPenalties();
        res.json({ success: true, penalties });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put('/penalties/:type', async (req, res) => {
    try {
        const Refund = require('../models/Refund');
        const { percentage } = req.body;
        if (percentage === undefined || percentage === null) {
            return res.status(400).json({ success: false, message: 'percentage is required' });
        }
        const pct = await Refund.setPenaltyPercentage(req.params.type, percentage, req.user.id);
        res.json({ success: true, message: 'Penalty updated', reservation_type: req.params.type, penalty_percentage: pct });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});


module.exports = router;
