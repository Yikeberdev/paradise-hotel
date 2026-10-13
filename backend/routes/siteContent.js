const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');

const DEFAULTS = {
    about_title: 'About Paradise Hotel',
    about_body:
        'Paradise Hotel (also known as Centera Hotel) is a full-service hotel in Debre Markos, Ethiopia. We offer comfortable rooms, workspace desks, restaurant dining, and reliable guest services for travelers and local customers.',
    about_location_name: 'Paradise Hotel',
    about_address: 'Paradise Hotel, Debre Markos, Amhara, Ethiopia',
    about_map_query: 'Paradise Hotel, Debre Markos, Ethiopia',
    about_extra: 'Reception: Open 24/7',
    contact_phone: '+251 58 771 0000',
    contact_email: 'info@paradisehotel.et',
    contact_address: 'Paradise Hotel, Debre Markos, Amhara, Ethiopia',
    contact_hours: 'Reception: 24/7',
    contact_extra: 'Also known as: Centera Hotel, Debre Markos',
};

async function ensureTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS site_content (
            id INT PRIMARY KEY DEFAULT 1,
            about_title VARCHAR(200) DEFAULT NULL,
            about_body TEXT,
            about_location_name VARCHAR(200) DEFAULT NULL,
            about_address VARCHAR(500) DEFAULT NULL,
            about_map_query VARCHAR(500) DEFAULT NULL,
            about_extra TEXT,
            contact_phone VARCHAR(50) DEFAULT NULL,
            contact_email VARCHAR(120) DEFAULT NULL,
            contact_address VARCHAR(500) DEFAULT NULL,
            contact_hours VARCHAR(200) DEFAULT NULL,
            contact_extra TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by INT NULL
        )
    `);
    const [rows] = await db.execute('SELECT id FROM site_content WHERE id = 1');
    if (!rows.length) {
        await db.execute(
            `INSERT INTO site_content (
                id, about_title, about_body, about_location_name, about_address, about_map_query, about_extra,
                contact_phone, contact_email, contact_address, contact_hours, contact_extra
             ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                DEFAULTS.about_title,
                DEFAULTS.about_body,
                DEFAULTS.about_location_name,
                DEFAULTS.about_address,
                DEFAULTS.about_map_query,
                DEFAULTS.about_extra,
                DEFAULTS.contact_phone,
                DEFAULTS.contact_email,
                DEFAULTS.contact_address,
                DEFAULTS.contact_hours,
                DEFAULTS.contact_extra,
            ]
        );
    }
}

function mergeRow(row) {
    const out = { ...DEFAULTS };
    if (row) {
        for (const k of Object.keys(DEFAULTS)) {
            if (row[k] != null && String(row[k]).trim() !== '') out[k] = row[k];
        }
        out.updated_at = row.updated_at || null;
    }
    return out;
}

/** Public: read About + Contact content */
router.get('/content', async (req, res) => {
    try {
        await ensureTable();
        const [rows] = await db.execute('SELECT * FROM site_content WHERE id = 1 LIMIT 1');
        res.json({ success: true, content: mergeRow(rows[0]) });
    } catch (error) {
        console.error('site content get:', error.message);
        res.json({ success: true, content: { ...DEFAULTS } });
    }
});

/** Manager/Admin: update About + Contact */
router.put('/content', auth, authorize('manager', 'admin'), async (req, res) => {
    try {
        await ensureTable();
        const b = req.body || {};
        const fields = [
            'about_title',
            'about_body',
            'about_location_name',
            'about_address',
            'about_map_query',
            'about_extra',
            'contact_phone',
            'contact_email',
            'contact_address',
            'contact_hours',
            'contact_extra',
        ];
        const values = fields.map((f) => (b[f] != null ? String(b[f]) : DEFAULTS[f]));
        await db.execute(
            `UPDATE site_content SET
                about_title=?, about_body=?, about_location_name=?, about_address=?, about_map_query=?, about_extra=?,
                contact_phone=?, contact_email=?, contact_address=?, contact_hours=?, contact_extra=?,
                updated_by=?
             WHERE id = 1`,
            [...values, req.user.id || null]
        );
        const [rows] = await db.execute('SELECT * FROM site_content WHERE id = 1 LIMIT 1');
        res.json({ success: true, message: 'About & Contact pages updated', content: mergeRow(rows[0]) });
    } catch (error) {
        console.error('site content put:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
module.exports.DEFAULTS = DEFAULTS;
