const db = require('../config/db');

class Desk {
    static async create(deskData) {
        const { deskNumber, capacity, location, price, description, image } = deskData;
        const [result] = await db.execute(
            `INSERT INTO desks 
            (desk_number, capacity, location, price, description, status, image) 
            VALUES (?, ?, ?, ?, ?, 'available', ?)`,
            [deskNumber, capacity, location || 'Main Hall', price || 0, description || '', image || 'desk-default.jpg']
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM desks WHERE id = ?', [id]);
        return rows[0];
    }

    static async findByDeskNumber(deskNumber) {
        const [rows] = await db.execute('SELECT * FROM desks WHERE desk_number = ?', [deskNumber]);
        return rows[0];
    }

    static async update(id, data) {
        const { deskNumber, capacity, location, price, description, status, image } = data;
        await db.execute(
            `UPDATE desks SET 
            desk_number = ?, capacity = ?, location = ?, price = ?, 
            description = ?, status = ?, image = ? 
            WHERE id = ?`,
            [deskNumber, capacity, location, price, description, status, image, id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE desks SET status = ? WHERE id = ?', [status, id]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM desks WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute('SELECT * FROM desks ORDER BY desk_number');
        return rows;
    }

    static async getAvailable() {
        const [rows] = await db.execute('SELECT * FROM desks WHERE status = "available" ORDER BY desk_number');
        return rows;
    }

    static async getReserved() {
        const [rows] = await db.execute('SELECT * FROM desks WHERE status = "reserved" ORDER BY desk_number');
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM desks');
        return rows[0].total;
    }

    static async countByStatus() {
        const [rows] = await db.execute(
            'SELECT status, COUNT(*) as count FROM desks GROUP BY status'
        );
        return rows;
    }
}

module.exports = Desk;