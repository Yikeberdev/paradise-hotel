const db = require('../config/db');

class Notification {
    static async create(notificationData) {
        const { userId, type, title, message, link } = notificationData;
        const [result] = await db.execute(
            `INSERT INTO notifications (user_id, type, title, message, link, is_read) 
            VALUES (?, ?, ?, ?, ?, 0)`,
            [userId, type, title, message, link || '']
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM notifications WHERE id = ?', [id]);
        return rows[0];
    }

    static async findByUserId(userId) {
        const [rows] = await db.execute(
            `SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 50`,
            [userId]
        );
        return rows;
    }

    static async getUnread(userId) {
        const [rows] = await db.execute(
            `SELECT * FROM notifications 
            WHERE user_id = ? AND is_read = 0 
            ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    static async getUnreadCount(userId) {
        const [rows] = await db.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );
        return rows[0].count;
    }

    static async markAsRead(id) {
        await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    }

    static async markAllAsRead(userId) {
        await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM notifications WHERE id = ?', [id]);
    }

    static async deleteAll(userId) {
        await db.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
    }

    static async getByType(userId, type) {
        const [rows] = await db.execute(
            `SELECT * FROM notifications 
            WHERE user_id = ? AND type = ? 
            ORDER BY created_at DESC`,
            [userId, type]
        );
        return rows;
    }

    static async createForAllUsers(notificationData) {
        const { type, title, message, link } = notificationData;
        const [users] = await db.execute('SELECT id FROM users WHERE is_active = 1');
        const results = [];
        for (const user of users) {
            const result = await this.create({
                userId: user.id,
                type,
                title,
                message,
                link
            });
            results.push(result);
        }
        return results;
    }

    static async createForRole(role, notificationData) {
        const { type, title, message, link } = notificationData;
        const [users] = await db.execute('SELECT id FROM users WHERE role = ? AND is_active = 1', [role]);
        const results = [];
        for (const user of users) {
            const result = await this.create({
                userId: user.id,
                type,
                title,
                message,
                link
            });
            results.push(result);
        }
        return results;
    }
}

module.exports = Notification;