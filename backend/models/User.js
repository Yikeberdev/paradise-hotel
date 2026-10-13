const db = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
    constructor(data = {}) {
        this.id = data.id || data._id || data.userId || null;
        this.username = data.username || data.userName || null;
        this.email = data.email || null;
        this.first_name = data.firstName || data.first_name || null;
        this.last_name = data.lastName || data.last_name || null;
        this.password = data.password || null;
        this.phone = data.phone || null;
        this.role = data.role || 'customer';
        this.status = data.status || 'active';
        this.profile_image = data.profile_image || null;
        this.address = data.address || null;
    }

    async save() {
        const userData = {
            username: this.username || (this.email ? this.email.split('@')[0] : null),
            password: this.password,
            email: this.email,
            firstName: this.first_name,
            lastName: this.last_name,
            phone: this.phone,
            role: this.role,
            status: this.status || 'active',
            address: this.address || null
        };
        const insertId = await User.create(userData);
        const created = await User.findById(insertId);
        return created;
    }

    static async create(userData) {
        const { username, password, email, firstName, lastName, phone, role, status, address } = userData;
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            `INSERT INTO users 
            (username, email, first_name, last_name, password, phone, role, status, address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, email, firstName, lastName, hashedPassword, phone || '', role || 'customer', status || 'active', address || null]
        );
        return result.insertId;
    }

    static async findByUsername(username) {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0];
    }

    static async findByEmail(email) {
        const em = String(email || '').trim().toLowerCase();
        const [rows] = await db.execute('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1', [em]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0];
    }

    static async comparePassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    static async update(id, data) {
        const existing = await User.findById(id);
        if (!existing) return null;

        const username = data.username ?? existing.username;
        const email = data.email ?? existing.email;
        const firstName = data.firstName ?? data.first_name ?? existing.first_name;
        const lastName = data.lastName ?? data.last_name ?? existing.last_name;
        const phone = data.phone ?? existing.phone;
        const role = data.role ?? existing.role;
        const status = data.status ?? existing.status;
        const profile_image = data.profile_image ?? existing.profile_image;
        const address = data.address ?? existing.address;

        let password = existing.password;
        if (data.password) {
            password = await bcrypt.hash(data.password, 10);
        }

        // Ensure profile_image column exists
        try {
            await db.execute('ALTER TABLE users ADD COLUMN profile_image VARCHAR(255) NULL');
        } catch (_) { }
        try {
            await db.execute('ALTER TABLE users ADD COLUMN address VARCHAR(255) NULL');
        } catch (_) { }

        await db.execute(
            `UPDATE users SET username = ?, email = ?, first_name = ?, last_name = ?, password = ?,
             phone = ?, role = ?, status = ?, profile_image = ?, address = ? WHERE id = ?`,
            [username, email, firstName, lastName, password, phone || '', role || 'customer',
                status || 'active', profile_image || null, address || null, id]
        );
        return await User.findById(id);
    }

    static async updateLastLogin(id) {
        await db.execute(
            'UPDATE users SET last_login = NOW(), last_active = NOW() WHERE id = ?',
            [id]
        );
    }

    static async updateLastActive(id) {
        await db.execute(
            'UPDATE users SET last_active = NOW() WHERE id = ?',
            [id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    }

    /**
     * Delete user and dependent rows so MySQL FK constraints do not fail.
     * Order: child tables first, then customers/employees, then users.
     */
    /**
     * Delete user and all dependent rows (notifications, customer bookings, etc.).
     * Uses ordered deletes + temporary FK check disable on this connection
     * so admin delete works even with complex foreign keys.
     */
    static async delete(id) {
        const userId = Number(id);
        if (!userId) throw new Error('Invalid user id');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('SET FOREIGN_KEY_CHECKS = 0');

            let customerId = null;
            try {
                const [custRows] = await conn.execute(
                    'SELECT id FROM customers WHERE user_id = ? LIMIT 1',
                    [userId]
                );
                if (custRows.length) customerId = custRows[0].id;
            } catch (_) { }

            // --- rows that reference users.id ---
            const userSql = [
                'DELETE FROM notifications WHERE user_id = ?',
                'DELETE FROM password_resets WHERE user_id = ?',
                'DELETE FROM locked_accounts WHERE user_id = ?',
                'DELETE FROM email_verifications WHERE user_id = ?',
                'DELETE FROM security_events WHERE user_id = ?',
                'DELETE FROM reports WHERE user_id = ?',
                'DELETE FROM feedback WHERE user_id = ?',
                'DELETE FROM comments WHERE user_id = ?',
                'DELETE FROM customer_reports WHERE user_id = ?',
                'DELETE FROM employees WHERE user_id = ?',
            ];
            for (const sql of userSql) {
                try {
                    await conn.execute(sql, [userId]);
                } catch (e) {
                    if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') {
                        console.warn('[User.delete]', sql, e.message);
                    }
                }
            }

            // --- rows that reference customers.id ---
            if (customerId != null) {
                // Line items for food orders
                try {
                    await conn.execute(
                        `DELETE FROM food_order_items WHERE order_id IN (SELECT id FROM (SELECT id FROM food_orders WHERE customer_id = ?) t)`,
                        [customerId]
                    );
                } catch (e) {
                    try {
                        await conn.execute(
                            `DELETE foi FROM food_order_items foi
                             INNER JOIN food_orders fo ON fo.id = foi.order_id
                             WHERE fo.customer_id = ?`,
                            [customerId]
                        );
                    } catch (e2) {
                        if (e2.code !== 'ER_NO_SUCH_TABLE' && e2.code !== 'ER_BAD_FIELD_ERROR') {
                            console.warn('[User.delete] food_order_items:', e2.message);
                        }
                    }
                }

                const customerSql = [
                    'DELETE FROM payments WHERE customer_id = ?',
                    'DELETE FROM refunds WHERE customer_id = ?',
                    'DELETE FROM room_reservations WHERE customer_id = ?',
                    'DELETE FROM desk_reservations WHERE customer_id = ?',
                    'DELETE FROM food_orders WHERE customer_id = ?',
                    'DELETE FROM bank_accounts WHERE customer_id = ?',
                    'DELETE FROM accounts WHERE customer_id = ?',
                    'DELETE FROM customer_accounts WHERE customer_id = ?',
                    'DELETE FROM reports WHERE customer_id = ?',
                    'DELETE FROM customer_reports WHERE customer_id = ?',
                    'DELETE FROM customers WHERE id = ?',
                ];
                for (const sql of customerSql) {
                    try {
                        await conn.execute(sql, [customerId]);
                    } catch (e) {
                        if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') {
                            console.warn('[User.delete]', sql, e.message);
                        }
                    }
                }

                // Extra safety: wipe any leftover bookings for this customer id
                try { await conn.execute('DELETE FROM desk_reservations WHERE customer_id = ?', [customerId]); } catch (_) { }
                try { await conn.execute('DELETE FROM room_reservations WHERE customer_id = ?', [customerId]); } catch (_) { }
                try { await conn.execute('DELETE FROM food_orders WHERE customer_id = ?', [customerId]); } catch (_) { }
                try { await conn.execute('DELETE FROM customers WHERE user_id = ?', [userId]); } catch (_) { }
                try { await conn.execute('DELETE FROM customers WHERE id = ?', [customerId]); } catch (_) { }
            }

            // Any customers still linked by user_id
            try {
                await conn.execute('DELETE FROM customers WHERE user_id = ?', [userId]);
            } catch (_) { }

            // Finally the user
            await conn.execute('DELETE FROM users WHERE id = ?', [userId]);

            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
            await conn.commit();
        } catch (err) {
            try { await conn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) { }
            try { await conn.rollback(); } catch (_) { }
            throw err;
        } finally {
            conn.release();
        }
    }

    static async findByIdAndUpdate(id, data) {
        return await User.update(id, data);
    }

    static async findByIdAndDelete(id) {
        return await User.delete(id);
    }

    static async findOne(query = {}) {
        if (query.email) return await User.findByEmail(query.email);
        if (query.username) return await User.findByUsername(query.username);
        if (query.id || query._id) return await User.findById(query.id || query._id);
        return null;
    }

    static async find(filters = {}) {
        let query = 'SELECT id, username, email, first_name, last_name, phone, role, status, profile_image, address, last_login, last_active, created_at FROM users WHERE 1=1';
        const params = [];
        if (filters.role) { query += ' AND role = ?'; params.push(filters.role); }
        if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
        query += ' ORDER BY created_at DESC';
        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async getAll() {
        const [rows] = await db.execute(
            'SELECT id, username, email, first_name, last_name, phone, role, status, profile_image, address, last_login, last_active, created_at FROM users ORDER BY created_at DESC'
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM users');
        return rows[0].total;
    }

    static async countCustomers() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM users WHERE role = "customer"');
        return rows[0].total;
    }
}

module.exports = User;