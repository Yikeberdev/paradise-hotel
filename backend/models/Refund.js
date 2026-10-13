const db = require('../config/db');

class Refund {
    /**
     * Ensure cancellation_penalties table exists and has default rows.
     */
    static async ensurePenaltyTable() {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS cancellation_penalties (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_type ENUM('room', 'desk', 'food') NOT NULL UNIQUE,
                penalty_percentage DECIMAL(5,2) NOT NULL DEFAULT 10.00,
                updated_by INT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        for (const t of ['room', 'desk', 'food']) {
            await db.execute(
                `INSERT IGNORE INTO cancellation_penalties (reservation_type, penalty_percentage) VALUES (?, 10.00)`,
                [t]
            );
        }
    }

    static async getPenaltyPercentage(reservationType) {
        await Refund.ensurePenaltyTable();
        const type = ['room', 'desk', 'food'].includes(reservationType) ? reservationType : 'room';
        const [rows] = await db.execute(
            'SELECT penalty_percentage FROM cancellation_penalties WHERE reservation_type = ?',
            [type]
        );
        if (rows.length) return Number(rows[0].penalty_percentage);
        return 10;
    }

    static async setPenaltyPercentage(reservationType, percentage, updatedBy = null) {
        await Refund.ensurePenaltyTable();
        const pct = Math.min(100, Math.max(0, Number(percentage)));
        const type = ['room', 'desk', 'food'].includes(reservationType) ? reservationType : null;
        if (!type) throw new Error('Invalid reservation type');
        await db.execute(
            `INSERT INTO cancellation_penalties (reservation_type, penalty_percentage, updated_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE penalty_percentage = VALUES(penalty_percentage), updated_by = VALUES(updated_by)`,
            [type, pct, updatedBy]
        );
        return pct;
    }

    static async listPenalties() {
        await Refund.ensurePenaltyTable();
        const [rows] = await db.execute(
            'SELECT reservation_type, penalty_percentage, updated_at FROM cancellation_penalties ORDER BY reservation_type'
        );
        return rows;
    }

    /**
     * Apply manager-configured percentage by type (room / desk / food).
     */
    static async calculatePenalty(originalAmount, reservationType) {
        const penaltyPct = await Refund.getPenaltyPercentage(reservationType);
        const amount = Number(originalAmount) || 0;
        const penaltyAmount = Number(((amount * penaltyPct) / 100).toFixed(2));
        const refundAmount = Number((amount - penaltyAmount).toFixed(2));
        return {
            originalAmount: amount,
            penaltyPercentage: penaltyPct,
            penaltyAmount,
            refundAmount: Math.max(0, refundAmount),
            reservationType: reservationType || 'room',
        };
    }

    static async create(data) {
        const {
            customerId, reservationType, reservationId, originalAmount,
            penaltyPercentage, penaltyAmount, refundAmount, reason
        } = data;

        const [result] = await db.execute(
            `INSERT INTO refund_requests
            (customer_id, reservation_type, reservation_id, original_amount, penalty_percentage, penalty_amount, refund_amount, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [customerId, reservationType, reservationId, originalAmount, penaltyPercentage, penaltyAmount, refundAmount, reason]
        );

        return result.insertId;
    }

    static async findByCustomerId(customerId) {
        const [rows] = await db.execute(
            `SELECT r.*, c.first_name, c.last_name, c.email
             FROM refund_requests r
             LEFT JOIN customers c ON r.customer_id = c.id
             WHERE r.customer_id = ?
             ORDER BY r.created_at DESC`,
            [customerId]
        );
        return rows;
    }

    static async getPending() {
        const [rows] = await db.execute(
            `SELECT r.*, c.first_name, c.last_name, c.email, c.phone
             FROM refund_requests r
             LEFT JOIN customers c ON r.customer_id = c.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at ASC`
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT r.*, c.first_name, c.last_name, c.email, c.user_id
             FROM refund_requests r
             LEFT JOIN customers c ON r.customer_id = c.id
             WHERE r.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async updateStatus(id, status, rejectionReason = null, processedBy = null) {
        await db.execute(
            `UPDATE refund_requests SET status = ?, rejection_reason = ?, processed_by = ?, processed_at = NOW() WHERE id = ?`,
            [status, rejectionReason, processedBy, id]
        );
    }
}

module.exports = Refund;
