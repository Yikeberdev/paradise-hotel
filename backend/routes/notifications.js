const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/db');

// Get user's notifications with unread count
router.get('/', auth, async (req, res) => {
    try {
        const [notifications] = await db.execute(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
            [req.user.id]
        );
        const [[unreadRow]] = await db.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [req.user.id]
        );
        res.json({
            success: true,
            notifications,
            unreadCount: unreadRow.count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get unread count only (lightweight poll)
router.get('/unread-count', auth, async (req, res) => {
    try {
        const [[row]] = await db.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [req.user.id]
        );
        res.json({ success: true, unreadCount: row.count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark single notification as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        await db.execute(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark all as read
router.put('/read-all', auth, async (req, res) => {
    try {
        await db.execute(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
            [req.user.id]
        );
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a notification
router.delete('/:id', auth, async (req, res) => {
    try {
        await db.execute(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Clear all notifications
router.delete('/', auth, async (req, res) => {
    try {
        await db.execute('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
        res.json({ success: true, message: 'All notifications cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;