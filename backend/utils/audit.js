const db = require('../config/db');

/**
 * Log action into audit_logs table for compliance and security monitoring
 */
async function logAuditAction(userId, userRole, action, targetType, targetId, details) {
    try {
        const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');
        await db.execute(
            `INSERT INTO audit_logs (user_id, user_role, action, target_type, target_id, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId || null, userRole || 'system', action, targetType || null, targetId || null, detailsStr]
        );
    } catch (error) {
        console.error('Audit log error:', error.message);
    }
}

module.exports = { logAuditAction };
