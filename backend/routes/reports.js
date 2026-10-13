const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { notifyUser, notifyStaff } = require('../utils/notify');

// Full operations report for managers/admins/receptionists
router.get('/', auth, authorize('manager', 'admin', 'receptionist'), async (req, res) => {
    try {
        const [rooms] = await db.execute(
            `SELECT r.id, rm.room_number, rm.room_type, c.first_name, c.last_name,
                    r.check_in_date, r.check_out_date, r.total_price, r.status, r.payment_status,
                    r.reservation_date
             FROM room_reservations r
             LEFT JOIN rooms rm ON r.room_id = rm.id
             LEFT JOIN customers c ON r.customer_id = c.id
             ORDER BY r.reservation_date DESC
             LIMIT 100`
        );

        const [desks] = await db.execute(
            `SELECT d.id, dk.desk_number, c.first_name, c.last_name,
                    d.reservation_date, d.start_time, d.end_time, d.duration_hours,
                    d.is_free_with_food, d.amount, d.status, d.payment_status, d.created_at
             FROM desk_reservations d
             LEFT JOIN desks dk ON d.desk_id = dk.id
             LEFT JOIN customers c ON d.customer_id = c.id
             ORDER BY d.created_at DESC
             LIMIT 100`
        );

        const [food] = await db.execute(
            `SELECT o.id, c.first_name, c.last_name, o.order_type, o.total_amount,
                    o.status, o.payment_status, o.order_date
             FROM food_orders o
             LEFT JOIN customers c ON o.customer_id = c.id
             ORDER BY o.order_date DESC
             LIMIT 100`
        );

        const [payments] = await db.execute(
            `SELECT p.id, p.reference_number, c.first_name, c.last_name, p.amount,
                    p.payment_type, p.payment_method, p.status, p.transaction_date
             FROM payments p
             LEFT JOIN customers c ON p.customer_id = c.id
             ORDER BY p.transaction_date DESC
             LIMIT 100`
        );

        const [summaryRows] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM room_reservations) as totalRoomReservations,
                (SELECT COUNT(*) FROM room_reservations WHERE status IN ('approved','checked_in','awaiting_payment')) as activeRoomReservations,
                (SELECT COUNT(*) FROM desk_reservations) as totalDeskReservations,
                (SELECT COUNT(*) FROM desk_reservations WHERE status IN ('approved','awaiting_payment')) as activeDeskReservations,
                (SELECT COUNT(*) FROM food_orders) as totalFoodOrders,
                (SELECT COUNT(*) FROM food_orders WHERE status IN ('preparing','ready','awaiting_payment')) as activeFoodOrders,
                (SELECT COUNT(*) FROM payments WHERE status IN ('approved','verified','completed')) as completedPayments,
                (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status IN ('approved','verified','completed')) as totalRevenue
        `);

        res.json({
            success: true,
            summary: summaryRows[0],
            rooms,
            desks,
            food,
            payments
        });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Customer submits a report to manager
router.post('/submit', auth, async (req, res) => {
    try {
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS customer_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NULL,
                user_id INT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                manager_response TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
        } catch (_) {}

        const { title, description } = req.body;
        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        // Get customer id
        const [customers] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        const customerId = customers.length > 0 ? customers[0].id : null;

        const [result] = await db.execute(
            `INSERT INTO customer_reports (customer_id, user_id, title, description) VALUES (?, ?, ?, ?)`,
            [customerId, req.user.id, title.trim(), description.trim()]
        );

        // Notify all managers
        const [managers] = await db.execute("SELECT id FROM users WHERE role = 'manager'");
        for (const manager of managers) {
            await notifyUser(manager.id, {
                type: 'report_received',
                title: 'Customer Report Received',
                message: `${req.user.first_name || req.user.username} submitted a report: "${title}"`,
                link: '/dashboard/manager?tab=customer-reports'
            });
        }

        res.status(201).json({ success: true, message: 'Report submitted successfully', id: result.insertId });
    } catch (error) {
        console.error('Submit report error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// Customer: list own reports + manager responses
router.get('/my', auth, async (req, res) => {
    try {
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS customer_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NULL,
                user_id INT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                manager_response TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
        } catch (_) {}

        const [reports] = await db.execute(
            `SELECT id, title, description, status, manager_response, created_at, customer_id, user_id
             FROM customer_reports
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, reports: reports || [] });
    } catch (error) {
        console.error('my reports error:', error);
        res.status(500).json({ success: false, message: error.message, reports: [] });
    }
});

// Manager views customer reports
router.get('/customer-reports', auth, authorize('manager', 'admin'), async (req, res) => {
    try {
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS customer_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NULL,
                user_id INT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                manager_response TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
        } catch (_) {}

        const [reports] = await db.execute(
            `SELECT cr.*,
                    COALESCE(u.username, '') AS username,
                    COALESCE(u.first_name, c.first_name, '') AS first_name,
                    COALESCE(u.last_name, c.last_name, '') AS last_name,
                    COALESCE(u.email, c.email, '') AS email,
                    c.phone
             FROM customer_reports cr
             LEFT JOIN users u ON cr.user_id = u.id
             LEFT JOIN customers c ON cr.customer_id = c.id
             ORDER BY cr.created_at DESC`
        );
        res.json({ success: true, reports: reports || [], count: (reports || []).length });
    } catch (error) {
        console.error('customer-reports list error:', error);
        res.status(500).json({ success: false, message: error.message, reports: [] });
    }
});

// Manager responds to customer report
router.put('/customer-reports/:id', auth, authorize('manager', 'admin'), async (req, res) => {
    try {
        const status = req.body.status || 'reviewed';
        const managerResponse = req.body.managerResponse || req.body.manager_response || '';
        await db.execute(
            'UPDATE customer_reports SET status = ?, manager_response = ? WHERE id = ?',
            [status, managerResponse, req.params.id]
        );

        // Notify customer
        const [reports] = await db.execute(
            'SELECT cr.user_id FROM customer_reports cr WHERE cr.id = ?',
            [req.params.id]
        );
        if (reports.length > 0 && reports[0].user_id) {
            await notifyUser(reports[0].user_id, {
                type: 'report_response',
                title: 'Manager responded to your report',
                message: managerResponse
                  ? `Manager response: "${managerResponse}"`
                  : 'The manager has reviewed your report.',
                link: '/dashboard/customer?tab=reports'
            });
        }

        res.json({ success: true, message: 'Report updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
