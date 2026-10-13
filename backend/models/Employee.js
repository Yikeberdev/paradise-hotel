const db = require('../config/db');

class Employee {
    static async create(employeeData) {
        const { userId, fullName, position, email, phone, address, status } = employeeData;
        const [result] = await db.execute(
            `INSERT INTO employees 
            (user_id, full_name, position, email, phone, address, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, fullName, position || 'receptionist', email, phone || '', address || '', status || 'active']
        );
        return result.insertId;
    }

    static async findByUserId(userId) {
        const [rows] = await db.execute('SELECT * FROM employees WHERE user_id = ?', [userId]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT e.*, u.username, u.role, u.email as user_email, u.status as user_status
             FROM employees e 
             LEFT JOIN users u ON e.user_id = u.id 
             WHERE e.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM employees WHERE email = ?', [email]);
        return rows[0];
    }

    static async update(id, data) {
        const { fullName, position, email, phone, address, status } = data;
        await db.execute(
            `UPDATE employees SET 
            full_name = ?, position = ?, email = ?, 
            phone = ?, address = ?, status = ? 
            WHERE id = ?`,
            [fullName, position, email, phone || '', address || '', status || 'active', id]
        );
    }

    static async delete(id) {
        await db.execute('DELETE FROM employees WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT e.*, u.username, u.role, u.status as user_status, u.last_login, u.last_active
            FROM employees e 
            LEFT JOIN users u ON e.user_id = u.id 
            ORDER BY e.hire_date DESC`
        );
        return rows;
    }

    static async getByPosition(position) {
        const [rows] = await db.execute('SELECT * FROM employees WHERE position = ?', [position]);
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM employees');
        return rows[0].total;
    }
}

module.exports = Employee;