const db = require('../config/db');

// Create a single notification for one user
async function notifyUser(userId, { type, title, message, link }) {
    if (!userId) return;
    try {
        await db.execute(
            'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
            [userId, type || 'general', title || '', message || '', link || null]
        );
    } catch (error) {
        console.error('notifyUser error:', error.message);
    }
}

// Notify every receptionist and admin (used when a customer submits something that needs approval)
async function notifyStaff({ type, title, message, link }) {
    try {
        const [staff] = await db.execute(
            "SELECT id FROM users WHERE role IN ('receptionist', 'admin')"
        );
        for (const s of staff) {
            await notifyUser(s.id, { type, title, message, link });
        }
    } catch (error) {
        console.error('notifyStaff error:', error.message);
    }
}

// Look up the user_id behind a customer_id (customers.user_id) so we can notify the customer
async function getUserIdForCustomer(customerId) {
    try {
        const [rows] = await db.execute('SELECT user_id FROM customers WHERE id = ?', [customerId]);
        return rows[0]?.user_id || null;
    } catch (error) {
        console.error('getUserIdForCustomer error:', error.message);
        return null;
    }
}

module.exports = { notifyUser, notifyStaff, getUserIdForCustomer };
