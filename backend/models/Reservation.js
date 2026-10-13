const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { uploadIdCard, uploadIdCardFields } = require('../middleware/upload');
const { notifyUser, notifyStaff, getUserIdForCustomer } = require('../utils/notify');
const { sendNotificationEmail } = require('../utils/email');
const { logAuditAction } = require('../utils/audit');
const { extractTextFromIdFile, matchPersonalInfoAgainstOcr, matchIdScanFields } = require('../utils/idOcr');


/**
 * Live camera frame check — used for auto-capture.
 * Front: must match registered/form full name (first + last).
 * Back: must match PIN/FAN digits and phone digits.
 * Body: side=front|back, fullName, pinNumber, phone
 * File field: frame
 */
router.post('/scan-frame', auth, uploadIdCard.single('frame'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, matched: false, message: 'No frame received' });
        }
        const side = String(req.body.side || 'front').toLowerCase();
        const fullName = String(req.body.fullName || '').trim();
        const pinNumber = String(req.body.pinNumber || req.body.fidaNumber || '').trim();
        const phone = String(req.body.phone || '').trim();

        // Prefer registration names from JWT user id
        let firstName = '';
        let lastName = '';
        try {
            const [rows] = await db.execute(
                'SELECT first_name, last_name, phone FROM users WHERE id = ?',
                [req.user.id]
            );
            if (rows.length) {
                firstName = String(rows[0].first_name || '').trim();
                lastName = String(rows[0].last_name || '').trim();
            }
        } catch (_) {}

        if (fullName) {
            const parts = fullName.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) {
                firstName = firstName || parts[0];
                lastName = lastName || parts.slice(1).join(' ');
            }
        }

        const pathMod = require('path');
        const idPath = pathMod.isAbsolute(req.file.path)
            ? req.file.path
            : pathMod.join(process.cwd(), req.file.path);

        let text = '';
        try {
            const ocr = await extractTextFromIdFile(idPath, req.file.mimetype, { fast: true });
            text = ocr.text || '';
        } catch (ocrErr) {
            // delete temp frame
            try { require('fs').unlinkSync(idPath); } catch (_) {}
            return res.json({
                success: true,
                matched: false,
                side,
                message: ocrErr.message || 'Could not read this frame',
                ocrPreview: '',
            });
        }

        // clean temp scan frames (optional keep last)
        try { require('fs').unlinkSync(idPath); } catch (_) {}

        if (side === 'front') {
            const nameMatch = matchPersonalInfoAgainstOcr(text, {
                firstName,
                lastName,
                fullName: fullName || `${firstName} ${lastName}`,
            });
            return res.json({
                success: true,
                matched: !!nameMatch.ok,
                side: 'front',
                checks: { name: !!nameMatch.ok },
                message: nameMatch.ok
                    ? 'Full name matched on front of ID'
                    : ('Name not matched yet: ' + (nameMatch.mismatches || []).join('; ')),
                ocrPreview: (nameMatch.ocrPreview || text || '').slice(0, 300),
                ocrWords: nameMatch.ocrWords || [],
            });
        }

        // back: PIN/FAN + any phone-like number (10–15 digits) — do not require exact registered phone text
        const { extractPhoneLikeNumbers } = require('../utils/idOcr');
        const digitText = String(text).replace(/\D/g, '');
        const pin = pinNumber.replace(/\D/g, '');
        let pinOk = true;
        let phoneOk = true;
        const mismatches = [];

        if (pin.length >= 6) {
            pinOk =
                digitText.includes(pin) ||
                digitText.includes(pin.slice(-8)) ||
                digitText.includes(pin.slice(-6));
            if (!pinOk) mismatches.push('PIN/FAN not found on this frame');
        } else {
            pinOk = false;
            mismatches.push('Enter PIN/FAN before scanning the back');
        }

        const phoneCandidates = extractPhoneLikeNumbers(text);
        // Accept any 10–15 digit sequence as a phone number (label "phone" not required)
        phoneOk = phoneCandidates.length > 0;
        // Also accept if registered phone digits appear
        const ph = phone.replace(/\D/g, '');
        if (!phoneOk && ph.length >= 10) {
            phoneOk =
                digitText.includes(ph) ||
                digitText.includes(ph.slice(-9)) ||
                digitText.includes(ph.slice(-8));
        }
        if (!phoneOk) {
            mismatches.push('No 10–15 digit phone-like number found on this frame (rescan back side)');
        }

        const matched = pinOk && phoneOk;
        return res.json({
            success: true,
            matched,
            side: 'back',
            checks: { pin: pinOk, phone: phoneOk },
            phoneCandidates: phoneCandidates.slice(0, 5),
            message: matched
                ? (phoneCandidates[0]
                    ? `PIN matched; phone-like number detected (${phoneCandidates[0]})`
                    : 'PIN and phone matched on back of ID')
                : mismatches.join('; '),
            ocrPreview: text.slice(0, 300),
        });
    } catch (error) {
        console.error('scan-frame error:', error);
        res.status(500).json({ success: false, matched: false, message: error.message });
    }
});

// Submit Room Reservation
router.post('/', auth, (req, res, next) => {
    uploadIdCardFields(req, res, (err) => {
        if (err) {
            console.error('Multer upload error:', err);
            return res.status(400).json({
                success: false,
                message: err.message || 'ID card upload failed. Use JPG/PNG under 5MB.',
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const roomId = req.body.roomId;
        const checkInDate = req.body.checkInDate;
        const checkOutDate = req.body.checkOutDate;
        const numberOfGuests = req.body.numberOfGuests || 1;
        const specialRequests = req.body.specialRequests || '';
        const fullName = req.body.fullName || '';
        const email = req.body.email || '';
        const phone = req.body.phone || '';
        const fidaNumber = req.body.fidaNumber || req.body.pinNumber || '';

        if (!roomId || !checkInDate || !checkOutDate) {
            return res.status(400).json({
                success: false,
                message: 'Room, Check-in date, and Check-out date are required',
            });
        }

        const frontFile = (req.files && (req.files.idCardFront || req.files.idCard) || [])[0];
        const backFile = (req.files && req.files.idCardBack || [])[0];
        if (!frontFile) {
            return res.status(400).json({
                success: false,
                message: 'Front side of the ID card is required (scan or upload).',
            });
        }

        // Registered user from DB (JWT only has firstName camelCase)
        const [userRows] = await db.execute(
            'SELECT id, first_name, last_name, email, phone FROM users WHERE id = ?',
            [req.user.id]
        );
        if (!userRows.length) {
            return res.status(400).json({ success: false, message: 'User account not found' });
        }
        const u = userRows[0];
        const regFirst = String(u.first_name || '').trim();
        const regLast = String(u.last_name || '').trim();
        if (!regFirst || !regLast) {
            return res.status(400).json({
                success: false,
                message: 'Your profile must have first and last name. Update your profile first.',
            });
        }

        const formParts = String(fullName || `${regFirst} ${regLast}`)
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        const regParts = `${regFirst} ${regLast}`.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const nameMatchesReg =
            formParts.join(' ') === regParts.join(' ') ||
            regParts.every((p) => formParts.includes(p));
        if (!nameMatchesReg) {
            return res.status(400).json({
                success: false,
                message:
                    'Name must match your registration ("' + regFirst + ' ' + regLast + '").',
            });
        }

        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
            return res.status(400).json({
                success: false,
                message: 'Check-out date must be after check-in date',
            });
        }

        const nights = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
        const [roomRows] = await db.execute('SELECT * FROM rooms WHERE id = ?', [roomId]);
        if (!roomRows.length) {
            return res.status(404).json({ success: false, message: 'Selected room not found' });
        }
        const room = roomRows[0];
        if (room.status === 'maintenance') {
            return res.status(400).json({
                success: false,
                message: 'Selected room is currently under maintenance',
            });
        }

        const [overlaps] = await db.execute(
            `SELECT id FROM room_reservations
             WHERE room_id = ?
               AND status IN ('pending', 'approved', 'checked_in')
               AND (check_in_date < ? AND check_out_date > ?)`,
            [roomId, checkOutDate, checkInDate]
        );
        if (overlaps.length > 0) {
            return res.status(400).json({
                success: false,
                message:
                    'This room is already reserved during the selected date and time. Please select another time or another room.',
            });
        }

        // OCR is advisory only — do not block reservation if form name matches registration
        let idOcrStatus = 'pending_staff_review';
        try {
            const pathMod = require('path');
            const resolvePath = (f) => {
                if (!f) return null;
                if (f.path && pathMod.isAbsolute(f.path)) return f.path;
                if (f.path) return pathMod.join(process.cwd(), f.path);
                return pathMod.join(__dirname, '../uploads/id_cards', f.filename);
            };
            let combinedText = '';
            for (const f of [frontFile, backFile].filter(Boolean)) {
                try {
                    const ocr = await extractTextFromIdFile(resolvePath(f), f.mimetype, { fast: true });
                    combinedText += '\n' + (ocr.text || '');
                } catch (sideErr) {
                    console.warn('OCR side failed:', sideErr.message);
                }
            }
            if (combinedText.trim()) {
                const ocrMatch = matchIdScanFields(combinedText, {
                    firstName: regFirst,
                    lastName: regLast,
                    fullName: fullName || `${regFirst} ${regLast}`,
                    pinNumber: fidaNumber,
                    phone: phone || u.phone || '',
                });
                if (ocrMatch && ocrMatch.ok) idOcrStatus = 'verified';
                else if (ocrMatch && ocrMatch.nameOk) idOcrStatus = 'name_verified_pending_details';
            }
        } catch (ocrErr) {
            console.warn('OCR skipped:', ocrErr.message);
            idOcrStatus = 'pending_staff_review';
        }

        const totalPrice = Number((Number(room.price_per_night || 0) * nights).toFixed(2));
        const idCardImagePath = `/uploads/id_cards/${frontFile.filename}`;
        const idCardBackPath = backFile ? `/uploads/id_cards/${backFile.filename}` : null;
        const fida = fidaNumber ? String(fidaNumber).trim() : null;
        const guestName = `${regFirst} ${regLast}`.trim();
        const guestEmail = u.email || email || '';
        const guestPhone = u.phone || phone || '';

        // Ensure optional columns exist (ignore errors if already present)
        for (const sql of [
            "ALTER TABLE customers ADD COLUMN id_card_back_image VARCHAR(255) NULL",
            "ALTER TABLE customers ADD COLUMN fida_number VARCHAR(30) NULL",
            "ALTER TABLE room_reservations ADD COLUMN id_card_back_image VARCHAR(255) NULL",
            "ALTER TABLE room_reservations ADD COLUMN fida_number VARCHAR(30) NULL",
        ]) {
            try { await db.execute(sql); } catch (_) {}
        }

        // Get or create customer
        let [custRows] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        let customerId;
        if (!custRows.length) {
            try {
                const [cRes] = await db.execute(
                    `INSERT INTO customers (user_id, first_name, last_name, email, phone, id_card_image, id_card_back_image, fida_number)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [req.user.id, regFirst, regLast, guestEmail, guestPhone, idCardImagePath, idCardBackPath, fida]
                );
                customerId = cRes.insertId;
            } catch (ce) {
                console.error('Customer insert fallback:', ce.message);
                const [cRes] = await db.execute(
                    `INSERT INTO customers (user_id, first_name, last_name, email, phone, id_card_image)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [req.user.id, regFirst, regLast, guestEmail, guestPhone, idCardImagePath]
                );
                customerId = cRes.insertId;
            }
        } else {
            customerId = custRows[0].id;
            try {
                await db.execute(
                    `UPDATE customers SET id_card_image = ?, id_card_back_image = COALESCE(?, id_card_back_image), fida_number = COALESCE(?, fida_number) WHERE id = ?`,
                    [idCardImagePath, idCardBackPath, fida, customerId]
                );
            } catch (_) {
                await db.execute(
                    `UPDATE customers SET id_card_image = ? WHERE id = ?`,
                    [idCardImagePath, customerId]
                );
            }
        }

        const paymentRef =
            'ROOM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Valid ENUM: status pending|approved|... ; payment_status pending|paid|failed
        let insertId;
        try {
            const [resResult] = await db.execute(
                `INSERT INTO room_reservations
                (room_id, customer_id, guest_name, guest_phone, guest_email,
                 check_in_date, check_out_date, number_of_guests, total_price,
                 id_card_image, id_card_back_image, fida_number,
                 status, payment_status, payment_reference, special_requests)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`,
                [
                    roomId, customerId, guestName, guestPhone, guestEmail,
                    checkInDate, checkOutDate, numberOfGuests || 1, totalPrice,
                    idCardImagePath, idCardBackPath, fida,
                    paymentRef, specialRequests || '',
                ]
            );
            insertId = resResult.insertId;
        } catch (insErr) {
            console.error('Room insert primary failed:', insErr.message);
            const [resResult] = await db.execute(
                `INSERT INTO room_reservations
                (room_id, customer_id, guest_name, guest_phone, guest_email,
                 check_in_date, check_out_date, number_of_guests, total_price,
                 id_card_image, status, payment_status, payment_reference, special_requests)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`,
                [
                    roomId, customerId, guestName, guestPhone, guestEmail,
                    checkInDate, checkOutDate, numberOfGuests || 1, totalPrice,
                    idCardImagePath, paymentRef, specialRequests || '',
                ]
            );
            insertId = resResult.insertId;
        }

        try {
            await logAuditAction(req.user.id, req.user.role, 'CREATE_ROOM_RESERVATION', 'room', insertId, {
                roomId, totalPrice, checkInDate, checkOutDate,
            });
        } catch (_) {}

        try {
            await notifyStaff({
                type: 'room_reservation',
                title: 'New Room Reservation Request',
                message:
                    `${regFirst} ${regLast} requested Room #${room.room_number} (${checkInDate} to ${checkOutDate}).` +
                    (idOcrStatus === 'verified' ? ' ID OCR: verified.' : ' ID uploaded — staff may review.'),
                link: '/dashboard/receptionist',
            });
        } catch (_) {}

        try {
            if (guestEmail) {
                sendNotificationEmail(
                    guestEmail,
                    'Room Reservation Request Submitted',
                    `Your room reservation request for Room #${room.room_number} (${checkInDate} to ${checkOutDate}) has been submitted. Please complete payment.`
                );
            }
        } catch (_) {}

        return res.status(201).json({
            success: true,
            idVerification: idOcrStatus,
            message: 'Room reservation created. Please proceed to payment.',
            reservation: {
                id: insertId,
                totalPrice,
                paymentReference: paymentRef,
                status: 'pending',
            },
        });
    } catch (error) {
        console.error('Room reservation error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Could not create room reservation',
            code: error.code || undefined,
        });
    }
});

router.get('/my', auth, async (req, res) => {
    try {
        const [reservations] = await db.execute(
            `SELECT r.*, rm.room_number, rm.room_type, rm.image, rm.price_per_night
             FROM room_reservations r
             LEFT JOIN rooms rm ON r.room_id = rm.id
             WHERE r.customer_id = (SELECT id FROM customers WHERE user_id = ?)
             ORDER BY r.reservation_date DESC`,
            [req.user.id]
        );
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Pending room reservations for Receptionist
router.get('/pending', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const [reservations] = await db.execute(
            `SELECT r.*, rm.room_number, rm.room_type, c.first_name, c.last_name, c.email, c.phone
             FROM room_reservations r
             LEFT JOIN rooms rm ON r.room_id = rm.id
             LEFT JOIN customers c ON r.customer_id = c.id
             WHERE r.status = 'awaiting_payment'
             ORDER BY r.reservation_date DESC`
        );
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// All room reservations (Admin / Receptionist / Manager)
router.get('/all', auth, authorize('receptionist', 'admin', 'manager'), async (req, res) => {
    try {
        const [reservations] = await db.execute(
            `SELECT r.*, rm.room_number, rm.room_type, rm.status as room_inventory_status,
                    COALESCE(NULLIF(TRIM(r.guest_name), ''), CONCAT(c.first_name, ' ', c.last_name)) as guest_name,
                    COALESCE(c.first_name, SUBSTRING_INDEX(r.guest_name, ' ', 1)) as first_name,
                    COALESCE(c.last_name, TRIM(SUBSTRING(r.guest_name, LOCATE(' ', r.guest_name)+1))) as last_name,
                    COALESCE(c.email, r.guest_email) as email,
                    COALESCE(c.phone, r.guest_phone) as phone
             FROM room_reservations r
             LEFT JOIN rooms rm ON r.room_id = rm.id
             LEFT JOIN customers c ON r.customer_id = c.id
             ORDER BY r.reservation_date DESC`
        );
        res.json({ success: true, reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Receptionist action on room reservation (Approve / Reject / Check-in / Check-out)
router.post('/:id/action', auth, authorize('receptionist', 'admin'), async (req, res) => {
    try {
        const { action, rejectionReason } = req.body;
        const reservationId = req.params.id;

        const [rRows] = await db.execute('SELECT * FROM room_reservations WHERE id = ?', [reservationId]);
        if (rRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }
        const reservation = rRows[0];

        if (action === 'approve') {
            await db.execute(
                `UPDATE room_reservations SET status = "approved", is_read = 1 WHERE id = ?`,
                [reservationId]
            );
            // Mark room booked
            await db.execute('UPDATE rooms SET status = "booked" WHERE id = ?', [reservation.room_id]);

            await logAuditAction(req.user.id, req.user.role, 'APPROVE_ROOM_RESERVATION', 'room', reservationId);

            const custUserId = await getUserIdForCustomer(reservation.customer_id);
            await notifyUser(custUserId, {
                type: 'room_approved',
                title: 'Room Reservation Approved!',
                message: `Your room reservation #${reservationId} has been approved by the receptionist.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                reservation.guest_email,
                'Room Reservation Approved',
                `Your room reservation #${reservationId} for Room dates ${reservation.check_in_date} to ${reservation.check_out_date} has been Approved!`
            );

            res.json({ success: true, message: 'Room reservation approved successfully' });
        } else if (action === 'reject') {
            await db.execute(
                `UPDATE room_reservations SET status = "rejected", rejection_reason = ?, is_read = 1 WHERE id = ?`,
                [rejectionReason || 'Request rejected by staff', reservationId]
            );
            await db.execute('UPDATE rooms SET status = "available" WHERE id = ?', [reservation.room_id]);

            await logAuditAction(req.user.id, req.user.role, 'REJECT_ROOM_RESERVATION', 'room', reservationId, { rejectionReason });

            const custUserId = await getUserIdForCustomer(reservation.customer_id);
            await notifyUser(custUserId, {
                type: 'room_rejected',
                title: 'Room Reservation Rejected',
                message: `Your room reservation #${reservationId} was rejected. Reason: ${rejectionReason || 'Staff review failed'}.`,
                link: '/dashboard/customer'
            });

            sendNotificationEmail(
                reservation.guest_email,
                'Room Reservation Rejected',
                `Your room reservation #${reservationId} was rejected. Reason: ${rejectionReason || 'Staff review failed'}.`
            );

            res.json({ success: true, message: 'Room reservation rejected' });
        } else if (action === 'check_in') {
            await db.execute(`UPDATE room_reservations SET status = "checked_in" WHERE id = ?`, [reservationId]);
            await db.execute('UPDATE rooms SET status = "booked" WHERE id = ?', [reservation.room_id]);
            res.json({ success: true, message: 'Guest checked in' });
        } else if (action === 'check_out') {
            await db.execute(`UPDATE room_reservations SET status = "checked_out" WHERE id = ?`, [reservationId]);
            await db.execute('UPDATE rooms SET status = "available" WHERE id = ?', [reservation.room_id]);
            res.json({ success: true, message: 'Guest checked out. Room is now available.' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        console.error('Room reservation action error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;