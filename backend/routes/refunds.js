const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const Refund = require('../models/Refund');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');
const { sendNotificationEmail } = require('../utils/email');
const { logAuditAction } = require('../utils/audit');
const BankAccount = require('../models/BankAccount');

// Calculate refund penalty before submitting
router.post('/calculate', auth, async (req, res) => {
    try {
        const { reservationType, reservationId } = req.body;
        if (!reservationType || !reservationId) {
            return res.status(400).json({ success: false, message: 'Reservation type and ID are required' });
        }

        let amount = 0;
        let startDate = new Date();

        if (reservationType === 'room') {
            const [rows] = await db.execute('SELECT total_price, check_in_date FROM room_reservations WHERE id = ?', [reservationId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Room reservation not found' });
            amount = Number(rows[0].total_price);
            startDate = new Date(rows[0].check_in_date);
        } else if (reservationType === 'desk') {
            const [rows] = await db.execute('SELECT amount, start_time, reservation_date FROM desk_reservations WHERE id = ?', [reservationId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Desk reservation not found' });
            amount = Number(rows[0].amount);
            startDate = rows[0].start_time ? new Date(rows[0].start_time) : new Date(rows[0].reservation_date);
        } else if (reservationType === 'food') {
            const [rows] = await db.execute('SELECT total_amount, order_date FROM food_orders WHERE id = ?', [reservationId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Food order not found' });
            amount = Number(rows[0].total_amount);
            startDate = new Date(rows[0].order_date);
        }

        const breakdown = await Refund.calculatePenalty(amount, reservationType);
        res.json({ success: true, calculation: breakdown });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit refund request (Customer)
router.post('/request', auth, async (req, res) => {
    try {
        const { reservationType, reservationId, reason } = req.body;
        if (!reservationType || !reservationId || !reason) {
            return res.status(400).json({ success: false, message: 'Missing required refund request fields' });
        }

        const [custRows] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        if (custRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer record not found' });
        }
        const customerId = custRows[0].id;

        // Check for existing pending request
        const [existing] = await db.execute(
            `SELECT id FROM refund_requests WHERE reservation_type = ? AND reservation_id = ? AND status = 'pending'`,
            [reservationType, reservationId]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'A refund request is already pending for this reservation.' });
        }

        let amount = 0;
        let startDate = new Date();

        if (reservationType === 'room') {
            const [rows] = await db.execute('SELECT total_price, check_in_date, status FROM room_reservations WHERE id = ? AND customer_id = ?', [reservationId, customerId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Reservation not found' });
            if (rows[0].status === 'cancelled') return res.status(400).json({ success: false, message: 'Reservation is already cancelled' });
            amount = Number(rows[0].total_price);
            startDate = new Date(rows[0].check_in_date);
        } else if (reservationType === 'desk') {
            const [rows] = await db.execute('SELECT amount, start_time, reservation_date, status FROM desk_reservations WHERE id = ? AND customer_id = ?', [reservationId, customerId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Reservation not found' });
            if (rows[0].status === 'cancelled') return res.status(400).json({ success: false, message: 'Reservation is already cancelled' });
            amount = Number(rows[0].amount);
            startDate = rows[0].start_time ? new Date(rows[0].start_time) : new Date(rows[0].reservation_date);
        } else if (reservationType === 'food') {
            const [rows] = await db.execute('SELECT total_amount, order_date, status FROM food_orders WHERE id = ? AND customer_id = ?', [reservationId, customerId]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
            if (rows[0].status === 'cancelled') return res.status(400).json({ success: false, message: 'Order is already cancelled' });
            amount = Number(rows[0].total_amount);
            startDate = new Date(rows[0].order_date);
        }

        const breakdown = await Refund.calculatePenalty(amount, reservationType);

        const refundId = await Refund.create({
            customerId,
            reservationType,
            reservationId,
            originalAmount: breakdown.originalAmount,
            penaltyPercentage: breakdown.penaltyPercentage,
            penaltyAmount: breakdown.penaltyAmount,
            refundAmount: breakdown.refundAmount,
            reason
        });

        await logAuditAction(req.user.id, req.user.role, 'SUBMIT_REFUND_REQUEST', reservationType, reservationId, {
            refundId,
            refundAmount: breakdown.refundAmount,
            penaltyPercentage: breakdown.penaltyPercentage
        });

        await notifyStaff({
            type: 'refund_request',
            title: 'New Refund Request',
            message: `Customer ${req.user.first_name} requested refund for ${reservationType} #${reservationId} (Net refund: ETB ${breakdown.refundAmount}).`,
            link: '/dashboard/receptionist'
        });

        sendNotificationEmail(
            req.user.email,
            'Refund Request Received',
            `Your refund request for ${reservationType} #${reservationId} has been submitted for review. Original Amount: ETB ${breakdown.originalAmount}, Net Refund: ETB ${breakdown.refundAmount}.`
        );

        res.status(201).json({
            success: true,
            message: 'Refund request submitted successfully. Waiting for receptionist review.',
            refundId,
            breakdown
        });
    } catch (error) {
        console.error('Refund submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Customer's refund requests
router.get('/my', auth, async (req, res) => {
    try {
        const [custRows] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        if (custRows.length === 0) return res.json({ success: true, refunds: [] });

        const refunds = await Refund.findByCustomerId(custRows[0].id);
        res.json({ success: true, refunds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Pending refund requests (Receptionist / Admin)
router.get('/pending', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const refunds = await Refund.getPending();
        res.json({ success: true, refunds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process refund request (Approve / Reject) (Receptionist / Admin)
router.post('/:id/action', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const { action, rejectionReason } = req.body;
        const refundId = req.params.id;

        const refund = await Refund.findById(refundId);
        if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found' });

        if (action === 'approve') {
            await Refund.updateStatus(refundId, 'approved', null, req.user.id);

            // Account transfer: hotel -> customer (refund)
            try {
                const hotelAccounts = await BankAccount.findHotelAccounts();
                const [custAccounts] = await db.execute(
                    `SELECT * FROM bank_accounts WHERE owner_type='customer' AND customer_id=? AND is_active=1 ORDER BY is_primary DESC LIMIT 1`,
                    [refund.customer_id]
                );
                if (hotelAccounts.length && custAccounts.length && Number(refund.refund_amount) > 0) {
                    // Prefer primary hotel account; use first with enough balance
                    let hotelAcc = null;
                    for (const ha of await (async () => {
                        const [rows] = await db.execute(`SELECT * FROM bank_accounts WHERE owner_type='hotel' AND is_active=1 ORDER BY is_primary DESC`);
                        return rows;
                    })()) {
                        if (Number(ha.balance) >= Number(refund.refund_amount)) { hotelAcc = ha; break; }
                    }
                    if (hotelAcc) {
                        await BankAccount.transfer({
                            fromAccountId: hotelAcc.id,
                            toAccountId: custAccounts[0].id,
                            amount: Number(refund.refund_amount),
                            transactionType: 'refund',
                            referenceType: 'refund',
                            referenceId: refundId,
                            description: `Refund for ${refund.reservation_type} #${refund.reservation_id}`,
                            initiatedBy: req.user.id
                        });
                    }
                }
            } catch (txErr) {
                console.error('Refund account transfer error:', txErr.message);
                // still mark refund approved even if transfer fails (logged)
            }


            // Update linked reservation & payment status
            if (refund.reservation_type === 'room') {
                await db.execute(`UPDATE room_reservations SET status = 'cancelled', payment_status = 'failed' WHERE id = ?`, [refund.reservation_id]);
                // Release room
                const [rRows] = await db.execute('SELECT room_id FROM room_reservations WHERE id = ?', [refund.reservation_id]);
                if (rRows.length > 0) {
                    await db.execute('UPDATE rooms SET status = "available" WHERE id = ?', [rRows[0].room_id]);
                }
            } else if (refund.reservation_type === 'desk') {
                await db.execute(`UPDATE desk_reservations SET status = 'cancelled', payment_status = 'failed' WHERE id = ?`, [refund.reservation_id]);
                const [dRows] = await db.execute('SELECT desk_id FROM desk_reservations WHERE id = ?', [refund.reservation_id]);
                if (dRows.length > 0) {
                    await db.execute('UPDATE desks SET status = "available" WHERE id = ?', [dRows[0].desk_id]);
                }
            } else if (refund.reservation_type === 'food') {
                await db.execute(`UPDATE food_orders SET status = 'cancelled', payment_status = 'failed' WHERE id = ?`, [refund.reservation_id]);
            }

            // Update payment record status if found
            await db.execute(
                `UPDATE payments SET status = 'refunded' WHERE reservation_type = ? AND reservation_id = ?`,
                [refund.reservation_type, refund.reservation_id]
            );

            await logAuditAction(req.user.id, req.user.role, 'APPROVE_REFUND', refund.reservation_type, refund.reservation_id, {
                refundId,
                refundAmount: refund.refund_amount
            });

            const custUserId = await getUserIdForCustomer(refund.customer_id);
            await notifyUser(custUserId, {
                type: 'refund_approved',
                title: 'Refund Approved',
                message: `Your refund request for ${refund.reservation_type} #${refund.reservation_id} has been approved (Net refund: ETB ${refund.refund_amount}).`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                refund.email,
                'Refund Approved',
                `Your refund request #${refundId} for ${refund.reservation_type} #${refund.reservation_id} has been approved for ETB ${refund.refund_amount}.`
            );

            res.json({ success: true, message: 'Refund request approved successfully' });
        } else if (action === 'reject') {
            await Refund.updateStatus(refundId, 'rejected', rejectionReason || 'Refund request rejected', req.user.id);

            await logAuditAction(req.user.id, req.user.role, 'REJECT_REFUND', refund.reservation_type, refund.reservation_id, {
                refundId,
                reason: rejectionReason
            });

            const custUserId = await getUserIdForCustomer(refund.customer_id);
            await notifyUser(custUserId, {
                type: 'refund_rejected',
                title: 'Refund Rejected',
                message: `Your refund request for ${refund.reservation_type} #${refund.reservation_id} was rejected: ${rejectionReason || 'Policy terms not met'}.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                refund.email,
                'Refund Request Rejected',
                `Your refund request #${refundId} was rejected. Reason: ${rejectionReason || 'Policy terms not met'}.`
            );

            res.json({ success: true, message: 'Refund request rejected' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        console.error('Refund action error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
