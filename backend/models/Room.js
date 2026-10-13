const db = require('../config/db');

class Room {
    static async create(roomData) {
        const { roomNumber, roomType, description, pricePerNight, capacity, status, amenities, image } = roomData;
        const [result] = await db.execute(
            `INSERT INTO rooms 
            (room_number, room_type, description, price_per_night, capacity, status, amenities, image) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                roomNumber, 
                roomType, 
                description || '', 
                pricePerNight, 
                capacity || 2, 
                status || 'available', 
                amenities || '',
                image || 'room-default.jpg'
            ]
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM rooms WHERE id = ?', [id]);
        return rows[0];
    }

    static async findByRoomNumber(roomNumber) {
        const [rows] = await db.execute('SELECT * FROM rooms WHERE room_number = ?', [roomNumber]);
        return rows[0];
    }

    static async update(id, data) {
        const { roomNumber, roomType, description, pricePerNight, capacity, status, amenities, image } = data;
        await db.execute(
            `UPDATE rooms SET 
            room_number = ?, room_type = ?, description = ?, price_per_night = ?, 
            capacity = ?, status = ?, amenities = ?, image = ? 
            WHERE id = ?`,
            [roomNumber, roomType, description, pricePerNight, capacity, status, amenities, image, id]
        );
    }

    static async delete(id) {
        await db.execute('DELETE FROM rooms WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute('SELECT * FROM rooms ORDER BY room_number');
        return rows;
    }

    static async getAvailable() {
        const [rows] = await db.execute(
            'SELECT * FROM rooms WHERE status = "available" ORDER BY price_per_night'
        );
        return rows;
    }

    static async getByType(roomType) {
        const [rows] = await db.execute('SELECT * FROM rooms WHERE room_type = ?', [roomType]);
        return rows;
    }

    static async getByStatus(status) {
        const [rows] = await db.execute('SELECT * FROM rooms WHERE status = ?', [status]);
        return rows;
    }

    static async search(filters) {
        let query = 'SELECT * FROM rooms WHERE 1=1';
        const params = [];

        if (filters.roomType) {
            query += ' AND room_type = ?';
            params.push(filters.roomType);
        }
        if (filters.minPrice) {
            query += ' AND price_per_night >= ?';
            params.push(parseFloat(filters.minPrice));
        }
        if (filters.maxPrice) {
            query += ' AND price_per_night <= ?';
            params.push(parseFloat(filters.maxPrice));
        }
        if (filters.capacity) {
            query += ' AND capacity >= ?';
            params.push(parseInt(filters.capacity));
        }
        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        query += ' ORDER BY price_per_night';
        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM rooms');
        return rows[0].total;
    }

    static async countByStatus() {
        const [rows] = await db.execute(
            'SELECT status, COUNT(*) as count FROM rooms GROUP BY status'
        );
        return rows;
    }
}

module.exports = Room;