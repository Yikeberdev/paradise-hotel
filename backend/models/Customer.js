const db = require('../config/db');

class Customer {
    static async create(customerData) {
        const { userId, firstName, lastName, email, phone, address, sex, age } = customerData;
        const [result] = await db.execute(
            `INSERT INTO customers 
            (user_id, first_name, last_name, email, phone, address, sex, age) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, firstName, lastName, email, phone, address, sex, age]
        );
        return result.insertId;
    }

    static async findByUserId(userId) {
        const [rows] = await db.execute('SELECT * FROM customers WHERE user_id = ?', [userId]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM customers WHERE id = ?', [id]);
        return rows[0];
    }

    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM customers WHERE email = ?', [email]);
        return rows[0];
    }

    static async update(id, data) {
        const { firstName, lastName, email, phone, address, sex, age } = data;
        await db.execute(
            `UPDATE customers SET 
            first_name = ?, last_name = ?, email = ?, phone = ?, 
            address = ?, sex = ?, age = ? 
            WHERE id = ?`,
            [firstName, lastName, email, phone, address, sex, age, id]
        );
    }

    static async delete(id) {
        await db.execute('DELETE FROM customers WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT c.*, u.username, u.role 
            FROM customers c 
            LEFT JOIN users u ON c.user_id = u.id 
            ORDER BY c.registration_date DESC`
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM customers');
        return rows[0].total;
    }
}

module.exports = Customer;