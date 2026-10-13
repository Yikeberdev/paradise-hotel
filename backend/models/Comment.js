const db = require('../config/db');

class Comment {
    static async create(commentData) {
        const { userId, username, jobTitle, feedback, rating, photo } = commentData;
        const [result] = await db.execute(
            `INSERT INTO comments 
            (customer_id, username, job_title, feedback, rating, photo, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [userId, username, jobTitle || '', feedback, rating || 5, photo || '']
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name, u.email 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            WHERE c.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async update(id, data) {
        const { status, jobTitle, feedback, rating, photo } = data;
        await db.execute(
            `UPDATE comments SET 
            status = ?, job_title = ?, feedback = ?, rating = ?, photo = ? 
            WHERE id = ?`,
            [status, jobTitle, feedback, rating, photo, id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE comments SET status = ? WHERE id = ?', [status, id]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM comments WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name, u.email, u.username 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            ORDER BY c.created_at DESC`
        );
        return rows;
    }

    static async getApproved() {
        const [rows] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            WHERE c.status = 'approved' 
            ORDER BY c.created_at DESC LIMIT 10`
        );
        return rows;
    }

    static async getPending() {
        const [rows] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            WHERE c.status = 'pending' 
            ORDER BY c.created_at DESC`
        );
        return rows;
    }

    static async getByStatus(status) {
        const [rows] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            WHERE c.status = ? 
            ORDER BY c.created_at DESC`,
            [status]
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM comments');
        return rows[0].total;
    }

    static async countByStatus() {
        const [rows] = await db.execute(
            'SELECT status, COUNT(*) as count FROM comments GROUP BY status'
        );
        return rows;
    }

    static async getAverageRating() {
        const [rows] = await db.execute(
            'SELECT AVG(rating) as average FROM comments WHERE status = "approved"'
        );
        return rows[0].average || 0;
    }
}

module.exports = Comment;