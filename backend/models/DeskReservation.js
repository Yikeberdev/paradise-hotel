const db = require('../config/db');

class DeskReservation {
    static async create(reservationData) {
        const { 
            deskId, customerId, guestName, guestPhone, guestEmail,
            reservationDate, timeSlot, partySize, specialRequests, paymentReference 
        } = reservationData;
        
        const [result] = await db.execute(
            `INSERT INTO desk_reservations 
            (desk_id, customer_id, guest_name, guest_phone, guest_email, 
             reservation_date, time_slot, party_size, status, payment_status, payment_reference, special_requests) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`,
            [
                deskId, customerId, guestName, guestPhone, guestEmail,
                reservationDate, timeSlot, partySize,
                paymentReference || null, specialRequests || ''
            ]
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT d.*, dk.desk_number, dk.capacity, dk.location,
                    u.first_name, u.last_name, u.email, u.phone 
            FROM desk_reservations d 
            LEFT JOIN desks dk ON d.desk_id = dk.id 
            LEFT JOIN users u ON d.customer_id = u.id 
            WHERE d.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async findByCustomerId(customerId) {
        const [rows] = await db.execute(
            `SELECT d.*, dk.desk_number, dk.capacity 
            FROM desk_reservations d 
            LEFT JOIN desks dk ON d.desk_id = dk.id 
            WHERE d.customer_id = ? 
            ORDER BY d.created_at DESC`,
            [customerId]
        );
        return rows;
    }

    static async findByDeskId(deskId) {
        const [rows] = await db.execute(
            'SELECT * FROM desk_reservations WHERE desk_id = ? ORDER BY reservation_date DESC',
            [deskId]
        );
        return rows;
    }

    static async update(id, data) {
        const { status, paymentStatus, paymentReference, specialRequests, isRead } = data;
        await db.execute(
            `UPDATE desk_reservations SET 
            status = ?, payment_status = ?, payment_reference = ?, 
            special_requests = ?, is_read = ? 
            WHERE id = ?`,
            [status, paymentStatus, paymentReference, specialRequests, isRead, id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE desk_reservations SET status = ? WHERE id = ?', [status, id]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM desk_reservations WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT d.*, dk.desk_number, u.first_name, u.last_name 
            FROM desk_reservations d 
            LEFT JOIN desks dk ON d.desk_id = dk.id 
            LEFT JOIN users u ON d.customer_id = u.id 
            ORDER BY d.created_at DESC`
        );
        return rows;
    }

    static async getPending() {
        const [rows] = await db.execute(
            `SELECT d.*, dk.desk_number, u.first_name, u.last_name 
            FROM desk_reservations d 
            LEFT JOIN desks dk ON d.desk_id = dk.id 
            LEFT JOIN users u ON d.customer_id = u.id 
            WHERE d.status = 'pending' AND d.is_read = 0 
            ORDER BY d.created_at DESC`
        );
        return rows;
    }

    static async getByStatus(status) {
        const [rows] = await db.execute(
            `SELECT d.*, dk.desk_number, u.first_name, u.last_name 
            FROM desk_reservations d 
            LEFT JOIN desks dk ON d.desk_id = dk.id 
            LEFT JOIN users u ON d.customer_id = u.id 
            WHERE d.status = ? 
            ORDER BY d.created_at DESC`,
            [status]
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM desk_reservations');
        return rows[0].total;
    }

    static async countByStatus() {
        const [rows] = await db.execute(
            'SELECT status, COUNT(*) as count FROM desk_reservations GROUP BY status'
        );
        return rows;
    }
}

module.exports = DeskReservation;