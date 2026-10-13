const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');

// Submit comment
router.post('/', async (req, res) => {
    try {
        const { feedback, rating, jobTitle } = req.body;

        if (!feedback || feedback.length < 5) {
            return res.status(400).json({ success: false, message: 'Feedback must be at least 5 characters' });
        }

        let userId = null;
        let username = 'guest';

        if (req.user) {
            userId = req.user.id;
            username = req.user.username;
        }

        await db.execute(
            'INSERT INTO comments (customer_id, username, job_title, feedback, rating, status) VALUES (?, ?, ?, ?, ?, "pending")',
            [userId, username, jobTitle || '', feedback, rating || 5]
        );

        // Notify admin
        const [admins] = await db.execute('SELECT id FROM users WHERE role = "admin"');
        for (const admin of admins) {
            await db.execute(
                'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
                [
                    admin.id,
                    'comment',
                    'New Feedback',
                    `New feedback from ${username}`,
                    '/dashboard/admin'
                ]
            );
        }

        res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get approved comments (public)
router.get('/approved', async (req, res) => {
    try {
        const [comments] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            WHERE c.status = "approved" 
            ORDER BY c.created_at DESC LIMIT 10`
        );
        res.json({ success: true, comments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all comments (Admin/Manager)
router.get('/', auth, authorize('admin'), async (req, res) => {
    try {
        const [comments] = await db.execute(
            `SELECT c.*, u.first_name, u.last_name, u.email, u.username 
            FROM comments c 
            LEFT JOIN users u ON c.customer_id = u.id 
            ORDER BY c.created_at DESC`
        );
        res.json({ success: true, comments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update comment status (Admin only)
router.put('/:id/status', auth, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        await db.execute('UPDATE comments SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Comment status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete comment (Admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
    try {
        await db.execute('DELETE FROM comments WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;