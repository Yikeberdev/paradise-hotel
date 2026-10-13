const express = require('express');
const router = express.Router();

function isValidEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}


const dns = require('dns').promises;

/** True if domain has MX (or A) records — basic "can receive mail" check */
async function isEmailDomainActive(email) {
    const em = String(email || '').trim().toLowerCase();
    if (!isValidEmailFormat(em)) return { ok: false, reason: 'Invalid email format' };
    const domain = em.split('@')[1];
    if (!domain || !domain.includes('.')) {
        return { ok: false, reason: 'Invalid email domain' };
    }
    // Common disposable / fake domains
    const blocked = new Set([
        'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
        '10minutemail.com', 'throwaway.email', 'yopmail.com', 'trashmail.com',
        'fakeinbox.com', 'sharklasers.com', 'getnada.com', 'emailondeck.com',
        'localhost', 'example.com', 'example.org', 'test.com', 'invalid.com',
    ]);
    if (blocked.has(domain)) {
        return { ok: false, reason: 'This email provider is not allowed. Use a real active inbox (Gmail, Yahoo, Outlook, etc.).' };
    }
    try {
        const mx = await dns.resolveMx(domain);
        if (mx && mx.length > 0) return { ok: true };
    } catch (_) { }
    try {
        const a = await dns.resolve4(domain);
        if (a && a.length > 0) return { ok: true, reason: 'no MX but domain resolves' };
    } catch (_) { }
    return {
        ok: false,
        reason: 'This email domain cannot receive mail (no mail server found). Use an active email address.',
    };
}


const jwt = require('jsonwebtoken');
const { sendNotificationEmail, sendPasswordOtpEmail, generateFiveDigitOtp, smtpConfigured, sendMail } = require('../utils/email');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('../models/User');
const db = require('../config/db');
const crypto = require('crypto');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { notifyUser } = require('../utils/notify');

const authCheck = typeof verifyToken === 'function' ? verifyToken : ((req, res, next) => next());
const adminCheck = typeof isAdmin === 'function' ? isAdmin : ((req, res, next) => next());

// Profile image upload setup
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `profile_${req.user.id}_${Date.now()}${ext}`);
    }
});
const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/image\/(jpeg|png|gif|webp)/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only images allowed'));
    }
});


async function ensureEmailVerificationsTable() {
    await db.execute(`CREATE TABLE IF NOT EXISTS email_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(128) NOT NULL,
        purpose VARCHAR(40) NOT NULL DEFAULT 'register',
        payload TEXT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (email),
        INDEX (purpose)
    )`);
    try { await db.execute('ALTER TABLE email_verifications MODIFY COLUMN otp VARCHAR(128) NOT NULL'); } catch (_) { }
    try { await db.execute('ALTER TABLE email_verifications ADD COLUMN payload TEXT NULL'); } catch (_) { }
}

// Send OTP to verify email is active before registration
router.post('/send-register-otp', async (req, res) => {
    try {
        await ensureEmailVerificationsTable();
        const emailRaw = String(req.body.email || '').trim().toLowerCase();
        if (!emailRaw || !isValidEmailFormat(emailRaw)) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid email address (example: name@gmail.com)',
            });
        }

        // Block obviously fake local domains
        const domain = emailRaw.split('@')[1] || '';
        if (!domain.includes('.') || domain.endsWith('.local') || domain === 'test') {
            return res.status(400).json({
                success: false,
                message: 'This email domain is not valid. Use a real email address.',
            });
        }

        const existing = await User.findByEmail(emailRaw);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'This email is already registered. Please sign in or use forgot password.',
            });
        }

        let otp;
        try {
            otp = generateFiveDigitOtp();
        } catch (_) {
            otp = String(Math.floor(10000 + Math.random() * 90000));
        }

        try {
            await db.execute(
                'UPDATE email_verifications SET used = 1 WHERE email = ? AND purpose = ? AND used = 0',
                [emailRaw, 'register']
            );
        } catch (_) { }

        await db.execute(
            `INSERT INTO email_verifications (email, otp, purpose, expires_at, used)
             VALUES (?, ?, 'register', DATE_ADD(NOW(), INTERVAL 15 MINUTE), 0)`,
            [emailRaw, String(otp)]
        );

        // Must deliver — proves mailbox can receive mail
        let mailResult;
        try {
            const subject = 'Paradise Hotel — Email verification code';
            const text =
                `Your Paradise Hotel registration code is: ${otp}\n\n` +
                `Enter this 5-digit code on the registration page to create your account.\n` +
                `This code expires in 15 minutes.`;
            const html =
                `<div style="font-family:Arial,sans-serif;padding:24px">` +
                `<h2>Paradise Hotel</h2>` +
                `<p>Your registration verification code:</p>` +
                `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#f0a500">${otp}</p>` +
                `<p style="color:#666">Expires in 15 minutes.</p></div>`;
            mailResult = await sendMail(emailRaw, subject, text, html);
        } catch (e) {
            mailResult = { sent: false, error: e.message };
        }

        if (!mailResult || !mailResult.sent) {
            console.error('[send-register-otp] mail failed', mailResult);
            return res.status(400).json({
                success: false,
                message:
                    'Could not send a verification email to this address. Use an active email inbox (check spelling). ' +
                    (mailResult && mailResult.error ? '(' + mailResult.error + ')' : ''),
                emailSent: false,
            });
        }

        console.log('[send-register-otp] sent to', emailRaw);
        return res.json({
            success: true,
            message: 'Verification code sent to ' + emailRaw + '. Enter the 5-digit code to complete registration.',
            emailSent: true,
            expiresInMinutes: 15,
        });
    } catch (error) {
        console.error('send-register-otp:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send verification code' });
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, confirmPassword, role, phone, address } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ success: false, message: 'Missing required registration fields' });
        }
        if (!isValidEmailFormat(email)) {
            return res.status(400).json({ success: false, message: 'Enter a valid email address' });
        }

        const emailNorm = String(email).trim().toLowerCase();

        const domainCheck = await isEmailDomainActive(emailNorm);
        if (!domainCheck.ok) {
            return res.status(400).json({
                success: false,
                message: domainCheck.reason || 'Please use a valid, active email address',
            });
        }

        const nameRe = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
        if (!nameRe.test(String(firstName).trim()) || !nameRe.test(String(lastName).trim())) {
            return res.status(400).json({
                success: false,
                message: 'First and last name may only contain letters and spaces'
            });
        }

        if (password !== confirmPassword && confirmPassword !== undefined) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!strong.test(String(password))) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character'
            });
        }

        const phoneDigits = String(phone || '').replace(/\D/g, '');
        if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'Phone number length must be between 10 and 15 digits'
            });
        }
        const [phoneDup] = await db.execute(
            `SELECT id FROM users WHERE REPLACE(REPLACE(REPLACE(IFNULL(phone,''), ' ', ''), '-', ''), '+', '') = ? LIMIT 1`,
            [phoneDigits]
        );
        if (phoneDup.length) {
            return res.status(400).json({ success: false, message: 'Phone number must be unique' });
        }

        // Must NOT already be a real (activated) user
        const existing = await User.findByEmail(emailNorm);
        if (existing) {
            return res.status(400).json({ success: false, message: 'User with this email already exists' });
        }

        if (!smtpConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Email service is not configured. Cannot verify an active inbox.',
            });
        }

        await ensureEmailVerificationsTable();
        const crypto = require('crypto');
        const verifyToken = crypto.randomBytes(24).toString('hex');

        // Hash password now; create user only after link is opened
        const passwordHash = await bcrypt.hash(String(password), 10);
        const payload = JSON.stringify({
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            email: emailNorm,
            phone: phoneDigits,
            address: address || '',
            role: role || 'customer',
            passwordHash,
        });

        const apiBase = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
        const apiVerifyUrl = `${apiBase}/api/auth/verify-email?token=${verifyToken}`;

        const subject = 'Paradise Hotel — Confirm your email to finish registration';
        const text =
            `Confirm this email is active to create your Paradise Hotel account.\n\n` +
            `Open this link within 30 minutes:\n${apiVerifyUrl}\n\n` +
            `If you did not request this, ignore this email. No account is created until you click the link.`;
        const html =
            `<div style="font-family:Arial,sans-serif;padding:24px">` +
            `<h2>Paradise Hotel</h2>` +
            `<p>Confirm your email is <strong>active</strong> to finish registration.</p>` +
            `<p><strong>No account is created until you click this link.</strong></p>` +
            `<p><a href="${apiVerifyUrl}" style="display:inline-block;padding:12px 20px;background:#f0a500;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold">Confirm email &amp; create account</a></p>` +
            `<p style="color:#666;font-size:13px">Link expires in 30 minutes.</p></div>`;

        // Send FIRST — if Gmail/SMTP cannot deliver, do not store pending registration
        const mailResult = await sendMail(emailNorm, subject, text, html);
        if (!mailResult || !mailResult.sent) {
            console.error('[register] delivery failed for', emailNorm, mailResult);
            return res.status(400).json({
                success: false,
                message:
                    'This email could not be reached. Use a real, active Gmail/Yahoo/Outlook address. ' +
                    (mailResult && mailResult.error ? '(' + mailResult.error + ')' : ''),
            });
        }

        // Invalidate previous pending signups for this email
        try {
            await db.execute(
                `UPDATE email_verifications SET used = 1 WHERE email = ? AND purpose = 'activate' AND used = 0`,
                [emailNorm]
            );
        } catch (_) { }

        await db.execute(
            `INSERT INTO email_verifications (email, otp, purpose, payload, expires_at, used)
             VALUES (?, ?, 'activate', ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), 0)`,
            [emailNorm, verifyToken, payload]
        );

        // NO users row yet — account appears only after link click
        console.log('[register] pending activation stored for', emailNorm, '(no user row yet)');
        res.status(200).json({
            success: true,
            message:
                'We sent a confirmation link to ' +
                emailNorm +
                '. Open your inbox (and Spam), click the link to create your account. ' +
                'Until you click it, you are not registered.',
            requiresEmailActivation: true,
            emailSent: true,
            accountCreated: false,
        });
    } catch (err) {
        console.error('Register error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: err.message || 'Registration failed' });
    }
});

// Create account only when activation link is opened (proves inbox works)
router.get('/verify-email', async (req, res) => {
    try {
        await ensureEmailVerificationsTable();
        const token = String(req.query.token || '').trim();
        if (!token || token.length < 16) {
            return res.status(400).send(htmlPage('Invalid link', 'This confirmation link is invalid.'));
        }

        const [rows] = await db.execute(
            `SELECT id, email, payload FROM email_verifications
             WHERE otp = ? AND purpose = 'activate' AND used = 0 AND expires_at > NOW()
             ORDER BY id DESC LIMIT 1`,
            [token]
        );
        if (!rows.length) {
            return res.status(400).send(htmlPage(
                'Link expired or invalid',
                'This link is invalid or expired. Please register again with an active email.'
            ));
        }

        const row = rows[0];
        let data;
        try {
            data = JSON.parse(row.payload || '{}');
        } catch (_) {
            data = null;
        }
        if (!data || !data.email || !data.passwordHash || !data.firstName || !data.lastName) {
            return res.status(400).send(htmlPage('Invalid data', 'Registration data is missing. Please register again.'));
        }

        // If user already exists (double-click), just mark used and ok
        const existing = await User.findByEmail(data.email);
        if (existing) {
            await db.execute('UPDATE email_verifications SET used = 1 WHERE id = ?', [row.id]);
            await db.execute('UPDATE users SET status = ? WHERE id = ?', ['active', existing.id]);
            const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '') + '/login';
            return res.send(htmlPage('Already registered', 'Your account is ready. You can sign in.', loginUrl));
        }

        let uname = String(data.email).split('@')[0].replace(/[^a-z0-9._-]/gi, '').slice(0, 30) || 'user';
        if (await User.findByUsername(uname)) {
            uname = uname + '_' + Date.now().toString(36).slice(-4);
        }

        // Insert user with pre-hashed password
        const [result] = await db.execute(
            `INSERT INTO users
             (username, email, first_name, last_name, password, phone, role, status, address)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
            [
                uname,
                data.email,
                data.firstName,
                data.lastName,
                data.passwordHash,
                data.phone || '',
                data.role || 'customer',
                data.address || null,
            ]
        );
        const userId = result.insertId;

        if ((data.role || 'customer') === 'customer') {
            try {
                await db.execute(
                    `INSERT INTO customers (user_id, first_name, last_name, email, phone, address)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, data.firstName, data.lastName, data.email, data.phone || '', data.address || '']
                );
            } catch (e) {
                console.error('Customer profile create:', e.message);
            }
        }

        await db.execute('UPDATE email_verifications SET used = 1 WHERE id = ?', [row.id]);
        console.log('[verify-email] user created id=', userId, 'email=', data.email);

        const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '') + '/login';
        return res.send(htmlPage(
            'Email confirmed',
            'Your email is active and your account has been created. You can sign in now.',
            loginUrl
        ));
    } catch (error) {
        console.error('verify-email:', error);
        res.status(500).send(htmlPage('Error', error.message || 'Activation failed'));
    }
});

function htmlPage(title, message, loginUrl) {
    const btn = loginUrl
        ? `<p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#f0a500;color:#1a1a2e;text-decoration:none;border-radius:8px;font-weight:bold">Go to login</a></p>`
        : '';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:20px">
<h1 style="color:#1a1a2e">Paradise Hotel</h1>
<h2>${title}</h2>
<p>${message}</p>
${btn}
</body></html>`;
}

router.post('/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginId = String(email || username || '').trim();
        if (!loginId || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        // Prefer email login; fall back to username for existing staff accounts
        let user = null;
        if (loginId.includes('@')) {
            user = await User.findByEmail(loginId.toLowerCase());
            if (!user) user = await User.findOne({ email: loginId.toLowerCase() });
        }
        if (!user) {
            user = await User.findByUsername(loginId);
        }
        if (!user) {
            user = await User.findOne({ email: loginId });
        }

        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

        // Check if user is suspended
        if (user.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the manager.' });
        }
        if (user.status === 'inactive') {
            return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact support.' });
        }
        if (user.status === 'pending_verification') {
            return res.status(403).json({
                success: false,
                message: 'Please activate your account first. Open the activation link we sent to your email (check Spam).',
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

        // Update last login
        await User.updateLastLogin(user.id);

        const fullNameVal = `${user.first_name || ''} ${user.last_name || ''}`.trim();

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                fullName: fullNameVal,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                email: user.email,
                phone: user.phone,
                profile_image: user.profile_image
            },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                fullName: fullNameVal,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                profile_image: user.profile_image,
                address: user.address
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
            return res.status(503).json({
                success: false,
                message: 'Database is not available. Check MySQL is running and backend/.env DB settings.'
            });
        }
        res.status(500).json({ success: false, message: err.message || 'Login failed' });
    }
});



// Decode Google JWT payload (base64url)
function decodeGoogleJwtPayload(idToken) {
    try {
        const parts = String(idToken || '').split('.');
        if (parts.length < 2) return null;
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch (e) {
        console.error('decodeGoogleJwtPayload:', e.message);
        return null;
    }
}

// Google Sign-In: ONLY for users who already registered (email must exist in users table).
// Never auto-creates accounts.
router.post('/google', async (req, res) => {
    try {
        const { credential, token, email: bodyEmail, firstName, lastName, googleId } = req.body;
        const idToken = credential || token;
        let email = bodyEmail;
        let given = firstName || '';
        let family = lastName || '';
        let sub = googleId || '';

        if (idToken) {
            let decoded = null;
            try {
                const clientId = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
                if (clientId) {
                    try {
                        const { OAuth2Client } = require('google-auth-library');
                        const client = new OAuth2Client(clientId);
                        const ticket = await client.verifyIdToken({ idToken, audience: clientId });
                        decoded = ticket.getPayload();
                    } catch (libErr) {
                        console.warn('google-auth-library verify failed, falling back to decode:', libErr.message);
                    }
                }
            } catch (e) {
                console.warn('google-auth-library not available:', e.message);
            }
            if (!decoded) {
                decoded = decodeGoogleJwtPayload(idToken);
            }
            if (decoded) {
                email = decoded.email || email;
                given = decoded.given_name || given;
                family = decoded.family_name || family;
                sub = decoded.sub || sub;
                if (!given && decoded.name) {
                    const bits = String(decoded.name).trim().split(/\s+/);
                    given = bits[0] || given;
                    family = bits.slice(1).join(' ') || family;
                }
            }
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                code: 'EMAIL_REQUIRED',
                message: 'Google account email is required.',
            });
        }
        email = String(email).trim().toLowerCase();

        // STRICT: must already exist in users table (registration required first)
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
            [email]
        );
        const user = rows && rows[0] ? rows[0] : null;

        if (!user) {
            console.log('[Google login] blocked — email not registered:', email);
            return res.status(403).json({
                success: false,
                code: 'NOT_REGISTERED',
                message: 'This Google email is not registered in Paradise Hotel. Please create an account first (Register), then sign in with Google using the same email.',
                email,
                firstName: given || '',
                lastName: family || '',
                requireRegistration: true,
            });
        }

        if (String(user.status || '').toLowerCase() === 'suspended') {
            return res.status(403).json({ success: false, code: 'SUSPENDED', message: 'Your account has been suspended.' });
        }
        if (String(user.status || '').toLowerCase() === 'inactive') {
            return res.status(403).json({ success: false, code: 'INACTIVE', message: 'Your account is inactive.' });
        }

        try { await User.updateLastLogin(user.id); } catch (_) { }

        const fullNameVal = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const jwtToken = jwt.sign(
            {
                id: user.id,
                role: user.role,
                fullName: fullNameVal,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                email: user.email,
                phone: user.phone,
                profile_image: user.profile_image
            },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token: jwtToken,
            user: {
                id: user.id,
                fullName: fullNameVal,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                profile_image: user.profile_image
            }
        });
    } catch (err) {
        console.error('Google login error:', err);
        res.status(500).json({ success: false, message: err.message || 'Google login failed' });
    }
});

// Get current user
router.get('/me', authCheck, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Update last_active
        await User.updateLastActive(user.id);

        const { password, ...safeUser } = user;
        let customerProfile = null;
        try {
            const [crows] = await db.execute(
                `SELECT id, first_name, last_name, email, phone, fida_number,
                        id_card_image, id_card_back_image, address, country, region
                 FROM customers WHERE user_id = ? LIMIT 1`,
                [user.id]
            );
            if (crows.length) {
                const ct = crows[0];
                customerProfile = {
                    ...ct,
                    has_id_on_file: !!(ct.id_card_image && String(ct.id_card_image).trim()),
                    has_id_back_on_file: !!(ct.id_card_back_image && String(ct.id_card_back_image).trim()),
                };
            }
        } catch (_) { }
        res.json({
            success: true,
            user: {
                ...safeUser,
                customer: customerProfile,
                has_id_on_file: !!(customerProfile && customerProfile.has_id_on_file),
                fida_number: customerProfile ? customerProfile.fida_number : null,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update profile
router.put('/profile', authCheck, (req, res, next) => {
    uploadProfile.single('profileImage')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Image upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        const { firstName, lastName, phone, address, currentPassword, newPassword, username } = req.body;
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const updateData = {};

        if (username && user.role === 'customer') {
            const existing = await User.findByUsername(username);
            if (existing && existing.id !== userId) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
            updateData.username = username;
        }

        if (firstName !== undefined && firstName !== '') updateData.firstName = firstName;
        if (lastName !== undefined && lastName !== '') updateData.lastName = lastName;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;

        if (req.file) {
            updateData.profile_image = `/uploads/profiles/${req.file.filename}`;
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: 'Current password is required' });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            }
            updateData.password = newPassword;
        }

        const updatedUser = await User.update(userId, updateData);
        if (!updatedUser) {
            return res.status(500).json({ success: false, message: 'Failed to update profile' });
        }

        // Keep customers table in sync for booking displays
        if (user.role === 'customer') {
            try {
                await db.execute(
                    `UPDATE customers SET first_name = ?, last_name = ?, phone = ?, address = ?
                     WHERE user_id = ?`,
                    [
                        updatedUser.first_name || firstName || '',
                        updatedUser.last_name || lastName || '',
                        updatedUser.phone || phone || '',
                        updatedUser.address || address || '',
                        userId
                    ]
                );
            } catch (e) {
                console.error('sync customer profile:', e.message);
            }
        }

        try {
            await notifyUser(userId, {
                type: 'profile_updated',
                title: 'Profile Updated',
                message: 'Your profile has been updated successfully.',
                link: '/profile'
            });
        } catch (_) { }

        const { password: pw, ...safeUser } = updatedUser;
        res.json({ success: true, message: 'Profile updated successfully', user: safeUser });
    } catch (err) {
        console.error('profile update error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to update profile' });
    }
});

// Alias POST for clients that cannot send multipart PUT
router.post('/profile', authCheck, (req, res, next) => {
    uploadProfile.single('profileImage')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Image upload failed' });
        next();
    });
}, async (req, res) => {
    // Reuse PUT logic via internal redirect of body
    req.method = 'PUT';
    // Call same handler stack by forwarding fields — simplest: duplicate call path
    try {
        const { firstName, lastName, phone, address, currentPassword, newPassword, username } = req.body;
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const updateData = {};
        if (username && user.role === 'customer') {
            const existing = await User.findByUsername(username);
            if (existing && existing.id !== userId) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
            updateData.username = username;
        }
        if (firstName !== undefined && firstName !== '') updateData.firstName = firstName;
        if (lastName !== undefined && lastName !== '') updateData.lastName = lastName;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;
        if (req.file) updateData.profile_image = `/uploads/profiles/${req.file.filename}`;
        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required' });
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            if (String(newPassword).length < 6) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            updateData.password = newPassword;
        }
        const updatedUser = await User.update(userId, updateData);
        if (!updatedUser) return res.status(500).json({ success: false, message: 'Failed to update profile' });
        if (user.role === 'customer') {
            try {
                await db.execute(
                    `UPDATE customers SET first_name = ?, last_name = ?, phone = ?, address = ? WHERE user_id = ?`,
                    [updatedUser.first_name || '', updatedUser.last_name || '', updatedUser.phone || '', updatedUser.address || '', userId]
                );
            } catch (_) { }
        }
        const { password: pw, ...safeUser } = updatedUser;
        res.json({ success: true, message: 'Profile updated successfully', user: safeUser });
    } catch (err) {
        console.error('profile post error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to update profile' });
    }
});


// Get all users (admin/manager)
router.get('/users', authCheck, async (req, res) => {
    try {
        if (!['admin', 'manager'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const users = await User.getAll();
        const safe = users.map(u => {
            const { password, ...rest } = u;
            return rest;
        });
        res.json({ success: true, users: safe });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Admin: create user
router.post('/users', authCheck, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { firstName, lastName, email, phone, password, role, status } = req.body;
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ success: false, message: 'First name, last name, email and password are required' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password min 6 characters' });
        }
        const emailNorm = String(email).trim().toLowerCase();
        const existingE = await User.findByEmail(emailNorm);
        if (existingE) return res.status(400).json({ success: false, message: 'Email already exists' });

        // Username derived from email (no username field on form)
        let username = emailNorm;
        const existingU = await User.findByUsername(username);
        if (existingU) {
            username = emailNorm.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now().toString(36);
        }

        const id = await User.create({
            firstName, lastName, username, email: emailNorm, phone, password,
            role: role || 'customer', status: status || 'active', address: null
        });

        // Mirror customer profile for customer role
        if ((role || 'customer') === 'customer') {
            try {
                await db.execute(
                    `INSERT INTO customers (user_id, first_name, last_name, email, phone)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, firstName, lastName, emailNorm, phone || '']
                );
            } catch (_) { }
        }

        // Employee row for staff roles
        if (['manager', 'receptionist', 'admin'].includes(role)) {
            try {
                await db.execute(
                    `INSERT INTO employees (user_id, full_name, position, email, phone, status)
                     VALUES (?, ?, ?, ?, ?, 'active')`,
                    [id, `${firstName} ${lastName}`.trim(), role, emailNorm, phone || '']
                );
            } catch (_) { }
        }

        res.status(201).json({ success: true, message: 'User created', id });
    } catch (err) {
        console.error('admin create user:', err);
        res.status(500).json({ success: false, message: err.message || 'Create failed' });
    }
});

router.put('/users/:id', authCheck, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { firstName, lastName, username, email, phone, password, role, status, address } = req.body;
        const data = {};
        if (firstName !== undefined) data.firstName = firstName;
        if (lastName !== undefined) data.lastName = lastName;
        if (username !== undefined) data.username = username;
        if (email !== undefined) data.email = email;
        if (phone !== undefined) data.phone = phone;
        if (role !== undefined) data.role = role;
        if (status !== undefined) data.status = status;
        if (address !== undefined) data.address = address;
        if (password) data.password = password;

        const updated = await User.update(req.params.id, data);
        if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
        const { password: pw, ...safe } = updated;
        res.json({ success: true, message: 'User updated', user: safe });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: delete user
router.delete('/users/:id', authCheck, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });
        if (target.role === 'admin' && String(target.id) === String(req.user.id)) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own admin account' });
        }
        await User.delete(req.params.id);
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// Update user status (manager only)
router.put('/users/:id/status', authCheck, async (req, res) => {
    try {
        if (!['admin', 'manager'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { status } = req.body;
        if (!['active', 'suspended', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        await User.updateStatus(req.params.id, status);

        // Notify the affected user
        await notifyUser(parseInt(req.params.id), {
            type: 'status_changed',
            title: 'Account Status Changed',
            message: `Your account status has been changed to "${status}".`,
            link: '/'
        });

        res.json({ success: true, message: `User status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



// Password reset OTP table
async function ensurePasswordResetsTable() {
    await db.execute(`CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL DEFAULT '',
        otp VARCHAR(10) NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (token),
        INDEX (user_id)
    )`);
    try { await db.execute('ALTER TABLE password_resets ADD COLUMN otp VARCHAR(10) NULL'); } catch (_) { }
    // Existing DBs may have token NOT NULL without default — make nullable or give default
    try { await db.execute('ALTER TABLE password_resets MODIFY COLUMN token VARCHAR(255) NULL'); } catch (_) { }
    try { await db.execute('ALTER TABLE password_resets MODIFY COLUMN otp VARCHAR(10) NULL'); } catch (_) { }
}

function isValidEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// Request password reset — sends 5-digit OTP to registered email only
router.post('/forgot-password', async (req, res) => {
    try {
        console.log('[forgot-password] body=', req.body);
        await ensurePasswordResetsTable();
        const emailRaw = (req.body.email || req.body.username || '').trim().toLowerCase();
        if (!emailRaw || !isValidEmailFormat(emailRaw)) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid registered email address',
            });
        }

        const [rows] = await db.execute(
            'SELECT id, email, first_name, last_name FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
            [emailRaw]
        );

        if (!rows.length) {
            console.log('[forgot-password] no user for', emailRaw);
            return res.status(404).json({
                success: false,
                message: 'No account found with that email. Use the email you registered with (same as login email).',
            });
        }

        const user = rows[0];
        console.log('[forgot-password] user id=', user.id, 'email=', user.email);

        try {
            await db.execute('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);
        } catch (e) {
            console.warn('[forgot-password] invalidate old OTPs:', e.message);
        }

        // Generate OTP locally as well (in case import failed)
        let otp;
        try {
            otp = generateFiveDigitOtp();
        } catch (_) {
            otp = String(Math.floor(10000 + Math.random() * 90000));
        }
        // Use MySQL server time for expiry (avoids UTC vs local timezone mismatch)
        try {
            // token column may be NOT NULL on older schemas — store otp in both token and otp
            await db.execute(
                `INSERT INTO password_resets (user_id, token, otp, expires_at, used)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE), 0)`,
                [user.id, String(otp), String(otp)]
            );
            console.log('[forgot-password] OTP row stored, code=', otp);
        } catch (insErr) {
            console.error('[forgot-password] insert OTP row failed:', insErr.message);
            // last resort: try without otp column
            try {
                await db.execute(
                    `INSERT INTO password_resets (user_id, token, expires_at, used)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE), 0)`,
                    [user.id, String(otp)]
                );
                console.log('[forgot-password] OTP stored in token column, code=', otp);
            } catch (insErr2) {
                console.error('[forgot-password] insert fallback failed:', insErr2.message);
            }
        }

        console.log('[forgot-password] sending OTP email to', emailRaw, 'otp=', otp);
        let mailResult = { sent: false, error: 'not attempted' };
        try {
            mailResult = await sendPasswordOtpEmail(emailRaw, otp);
        } catch (mailErr) {
            console.error('[forgot-password] sendPasswordOtpEmail threw:', mailErr);
            mailResult = { sent: false, error: mailErr.message };
        }
        console.log('[forgot-password] mailResult=', mailResult);

        if (mailResult && mailResult.sent) {
            return res.json({
                success: true,
                message: 'A 5-digit OTP was sent to ' + emailRaw + '. Check inbox and Spam.',
                expiresInMinutes: 2,
                emailSent: true,
            });
        }

        // Still allow reset using OTP printed on server if email failed
        console.log('[forgot-password] EMAIL FAILED — OTP for', emailRaw, 'is:', otp);
        return res.json({
            success: true,
            message:
                'OTP was created but email could not be delivered (' +
                (mailResult && mailResult.error ? mailResult.error : 'unknown') +
                '). Check the backend terminal for the OTP, or fix SMTP.',
            expiresInMinutes: 2,
            emailSent: false,
            smtpConfigured: typeof smtpConfigured === 'function' ? smtpConfigured() : true,
        });
    } catch (error) {
        console.error('forgot-password:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send reset OTP' });
    }
});


// Validate OTP only — fast path (no table migration on each request)
router.post('/verify-reset-otp', async (req, res) => {
    try {
        const emailRaw = String(req.body.email || '').trim().toLowerCase();
        const otp = String(req.body.otp || req.body.token || '').replace(/\s+/g, '').trim();
        if (!emailRaw || !otp || otp.length !== 5) {
            return res.status(400).json({ success: false, message: 'Email and 5-digit OTP are required' });
        }

        // One query: join user + latest unused non-expired OTP
        const [rows] = await db.execute(
            `SELECT pr.id
             FROM password_resets pr
             INNER JOIN users u ON u.id = pr.user_id
             WHERE LOWER(TRIM(u.email)) = ?
               AND pr.used = 0
               AND pr.expires_at > NOW()
               AND (pr.otp = ? OR pr.token = ?)
             ORDER BY pr.id DESC
             LIMIT 1`,
            [emailRaw, otp, otp]
        );

        if (!rows.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP. Request a new code.',
            });
        }
        return res.json({
            success: true,
            message: 'OTP verified. Enter your new password.',
            verified: true,
        });
    } catch (error) {
        console.error('verify-reset-otp:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reset password with email + 5-digit OTP
router.post('/reset-password', async (req, res) => {
    try {
        await ensurePasswordResetsTable();
        const emailRaw = String(req.body.email || '').trim().toLowerCase();
        const otp = String(req.body.otp || req.body.token || '').replace(/\s+/g, '').trim();
        const newPassword = req.body.newPassword;

        console.log('[reset-password] email=', emailRaw, 'otp=', otp);

        if (!emailRaw || !isValidEmailFormat(emailRaw)) {
            return res.status(400).json({ success: false, message: 'Valid email is required' });
        }
        if (!otp || !/^\d{5}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'Enter the 5-digit OTP sent to your email' });
        }
        if (!newPassword) {
            return res.status(400).json({ success: false, message: 'New password is required' });
        }
        const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!strong.test(String(newPassword))) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character',
            });
        }

        const [users] = await db.execute(
            'SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
            [emailRaw]
        );
        if (!users.length) {
            return res.status(404).json({ success: false, message: 'No account found with that email' });
        }
        const userId = users[0].id;

        // Match OTP as string; do not rely on JS Date vs MySQL timezone
        const [rows] = await db.execute(
            `SELECT id, otp, token, expires_at, used
             FROM password_resets
             WHERE user_id = ?
               AND used = 0
               AND expires_at > NOW()
               AND (
                    TRIM(COALESCE(otp, '')) = ?
                 OR TRIM(COALESCE(token, '')) = ?
               )
             ORDER BY id DESC
             LIMIT 1`,
            [userId, otp, otp]
        );

        if (!rows.length) {
            // Debug why it failed
            const [any] = await db.execute(
                `SELECT id, otp, expires_at, used, (expires_at > NOW()) AS not_expired
                 FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 3`,
                [userId]
            );
            console.log('[reset-password] no match. recent rows=', any);
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP. Request a new code.',
            });
        }

        const hash = await bcrypt.hash(String(newPassword), 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
        await db.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [rows[0].id]);
        await db.execute('UPDATE password_resets SET used = 1 WHERE user_id = ?', [userId]);

        console.log('[reset-password] password updated for user', userId);
        res.json({
            success: true,
            message: 'Password updated successfully. You can log in with your email and new password.',
        });
    } catch (error) {
        console.error('reset-password:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: force reset user password
router.post('/admin/reset-user-password', authCheck, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { userId, newPassword } = req.body;
        if (!userId || !newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ success: false, message: 'userId and newPassword (min 6) required' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
        res.json({ success: true, message: 'User password reset by admin' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;