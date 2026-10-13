const db = require('../config/db');

class Payment {
    static async create(paymentData) {
        const { 
            userId, type, referenceId, amount, paymentMethod, 
            accountNumber, accountName, transactionId, notes 
        } = paymentData;
        
        const referenceNumber = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        
        const [result] = await db.execute(
            `INSERT INTO payments 
            (reference_number, customer_id, amount, payment_type, payment_method, 
             account_number, account_name, transaction_id, status, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [
                referenceNumber, userId, amount, type, paymentMethod || 'cbe_birr',
                accountNumber || '', accountName || '', transactionId || '',
                notes || ''
            ]
        );
        return { id: result.insertId, referenceNumber };
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name, u.email, u.phone 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            WHERE p.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async findByReference(referenceNumber) {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name, u.email 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            WHERE p.reference_number = ?`,
            [referenceNumber]
        );
        return rows[0];
    }

    static async findByCustomerId(customerId) {
        const [rows] = await db.execute(
            `SELECT * FROM payments WHERE customer_id = ? ORDER BY transaction_date DESC`,
            [customerId]
        );
        return rows;
    }

    static async update(id, data) {
        const { status, paymentMethod, accountNumber, accountName, transactionId, notes, isRead } = data;
        await db.execute(
            `UPDATE payments SET 
            status = ?, payment_method = ?, account_number = ?, 
            account_name = ?, transaction_id = ?, notes = ?, is_read = ? 
            WHERE id = ?`,
            [status, paymentMethod, accountNumber, accountName, transactionId, notes, isRead, id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE payments SET status = ? WHERE id = ?', [status, id]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM payments WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name, u.email 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            ORDER BY p.transaction_date DESC`
        );
        return rows;
    }

    static async getPending() {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name, u.email 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            WHERE p.status = 'pending' AND p.is_read = 0 
            ORDER BY p.transaction_date DESC`
        );
        return rows;
    }

    static async getByStatus(status) {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name, u.email 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            WHERE p.status = ? 
            ORDER BY p.transaction_date DESC`,
            [status]
        );
        return rows;
    }

    static async getByType(type) {
        const [rows] = await db.execute(
            `SELECT p.*, u.first_name, u.last_name 
            FROM payments p 
            LEFT JOIN users u ON p.customer_id = u.id 
            WHERE p.payment_type = ? 
            ORDER BY p.transaction_date DESC`,
            [type]
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM payments');
        return rows[0].total;
    }

    static async getTotalRevenue() {
        const [rows] = await db.execute(
            'SELECT SUM(amount) as total FROM payments WHERE status = "approved"'
        );
        return rows[0].total || 0;
    }

    static async getRevenueByType() {
        const [rows] = await db.execute(
            `SELECT payment_type, SUM(amount) as total, COUNT(*) as count 
            FROM payments 
            WHERE status = 'approved' 
            GROUP BY payment_type`
        );
        return rows;
    }

    static async getMonthlyRevenue() {
        const [rows] = await db.execute(
            `SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month, 
                    SUM(amount) as total, COUNT(*) as count 
            FROM payments 
            WHERE status = 'approved' 
            GROUP BY DATE_FORMAT(transaction_date, '%Y-%m') 
            ORDER BY month DESC 
            LIMIT 12`
        );
        return rows;
    }
}

module.exports = Payment;