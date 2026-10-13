const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Always load backend/.env (works even if process is started from repo root)
dotenv.config({ path: path.join(__dirname, '.env') });

// --- Email / OTP status (shows on every start) ---
(function logSmtpStatus() {
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
    console.log('────────────────────────────────────────');
    if (user && pass) {
        console.log('✉️  SMTP: configured');
        console.log('   USER:', user);
        console.log('   PASS:', '*'.repeat(Math.min(pass.length, 16)) + ' (' + pass.length + ' chars)');
        console.log('   HOST:', process.env.SMTP_HOST || 'gmail (default)');
    } else {
        console.log('⚠️  SMTP: NOT configured — OTP will NOT be emailed');
        console.log('   Fix: edit backend/.env and set:');
        console.log('   SMTP_USER=your@gmail.com');
        console.log('   SMTP_PASS=your16charapppassword');
        console.log('   (no spaces in SMTP_PASS)');
    }
    try {
        require('nodemailer');
        console.log('   nodemailer: installed');
    } catch (e) {
        console.log('   nodemailer: MISSING → run: npm install nodemailer');
    }
    console.log('────────────────────────────────────────');
})();

const app = express();

const {
    securityHeaders,
    apiRateLimit,
    authRateLimit,
    loginRateLimit,
    safeErrorHandler,
    blockDangerousPaths,
    hidePoweredBy,
} = require('./middleware/security');

const {
    blockMiddleware,
    inspectRequestMiddleware,
    clearLocalBlocks,
} = require('./middleware/intrusion');

// Remove accidental localhost blocks from earlier tests so the app stays reachable
clearLocalBlocks().catch(() => {});

// Trust proxy when behind Nginx / load balancer (needed for rate-limit IP + HTTPS detection)
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security headers on all responses
app.use(hidePoweredBy);
app.use(blockDangerousPaths);
app.use(securityHeaders);
app.disable('x-powered-by');

// Intrusion: reject already-blocked IPs, inspect payloads
app.use(blockMiddleware);
app.use(inspectRequestMiddleware);


// CORS configuration
const isProd = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const defaultAllowed = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = [...new Set([...configuredOrigins, ...defaultAllowed])];

app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (curl, mobile apps, server-to-server)
        if (!origin) return cb(null, true);

        // In dev or wildcard configured, allow all
        if (!isProd || configuredOrigins.includes('*')) return cb(null, true);

        const cleanOrigin = origin.replace(/\/+$/, '');
        if (allowedOrigins.includes(cleanOrigin)) return cb(null, true);

        // If no custom FRONTEND_URL/CORS_ORIGINS was configured in production,
        // permit the incoming origin and warn, so the app doesn't fail on initial deploy
        if (configuredOrigins.length === 0) {
            console.warn(`⚠️ [CORS] Allowed origin "${origin}" because FRONTEND_URL is not set. Set FRONTEND_URL in environment for production.`);
            return cb(null, true);
        }

        console.warn(`⚠️ [CORS] Blocked request from origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
        return cb(null, false);
    },
    credentials: true,
}));

// Limit JSON body size (DoS / large payload protection)
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '1mb' }));

// Auth limits AFTER body parser so login can key by email (not whole IP)
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/auth/forgot-password', authRateLimit);
app.use('/api/auth/reset-password', authRateLimit);
app.use('/api/auth/google', authRateLimit);
app.use('/api/auth/send-register-otp', authRateLimit);

// General API rate limit (high ceiling for shared networks)
app.use('/api/', apiRateLimit);

// Ensure upload folders exist
const fs = require('fs');
['rooms', 'desks', 'foods', 'profiles', 'id_cards', 'receipts'].forEach((folder) => {
    const dir = path.join(__dirname, 'uploads', folder);
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
});

// Public media only (room/desk/food images) — NOT id cards or receipts
const publicUploadOpts = {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
    },
};
['rooms', 'desks', 'foods', 'profiles'].forEach((folder) => {
    const dir = path.join(__dirname, 'uploads', folder);
    app.use('/uploads/' + folder, express.static(dir, publicUploadOpts));
});

// Block direct public access to sensitive folders
app.use('/uploads/id_cards', (req, res) => {
    res.status(401).json({
        success: false,
        message: 'ID card files require authentication. Use /api/secure-media/id_cards/...',
    });
});
app.use('/uploads/receipts', (req, res) => {
    res.status(401).json({
        success: false,
        message: 'Receipt files require authentication. Use /api/secure-media/receipts/...',
    });
});

// Import routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const reservationRoutes = require('./routes/reservations');
const deskRoutes = require('./routes/desks');
const foodRoutes = require('./routes/food');
const commentRoutes = require('./routes/comments');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');
const refundRoutes = require('./routes/refunds');
const managerRoutes = require('./routes/manager');
const accountRoutes = require('./routes/accounts');
const siteContentRoutes = require('./routes/siteContent');
const receptionistRoutes = require('./routes/receptionist');
const secureMediaRoutes = require('./routes/secureMedia');
const securityAlertRoutes = require('./routes/securityAlerts');

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/desks', deskRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/site', siteContentRoutes);
app.use('/api/receptionist', receptionistRoutes);
app.use('/api/secure-media', secureMediaRoutes);
app.use('/api/security', securityAlertRoutes);

// Health check (returns 200 with database status)
app.get(['/api/health', '/health'], async (req, res) => {
    let dbStatus = 'disconnected';
    let dbError = null;
    try {
        const db = require('./config/db');
        await db.query('SELECT 1');
        dbStatus = 'connected';
    } catch (err) {
        dbError = err.code || err.message;
    }
    res.status(200).json({
        success: true,
        status: 'online',
        uptime: process.uptime(),
        database: dbStatus,
        ...(dbError ? { error: dbError } : {})
    });
});

// Serve static frontend build if it exists (for single-service deployment)
const frontendBuildPath = path.join(__dirname, '../frontend/build');
if (fs.existsSync(frontendBuildPath)) {
    app.use(express.static(frontendBuildPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            return next();
        }
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
}

// Root route (API info when frontend build is not served)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🏨 Paradise Hotel API Server',
        version: '1.0.0',
        endpoints: {
            register: '/api/auth/register',
            login: '/api/auth/login',
            rooms: '/api/rooms',
            reservations: '/api/reservations',
            desks: '/api/desks',
            food: '/api/food',
            payments: '/api/payments',
            refunds: '/api/refunds',
            health: '/api/health'
        }
    });
});

// 404 handler for API routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
    });
});

// Safe error handler (no stack traces to clients in production)
app.use(safeErrorHandler);

const PORT = process.env.PORT || 5000;

// Auto-release rooms when checkout date is reached (every 60s)
try {
    const { releaseExpiredRooms } = require('./routes/rooms');
    if (typeof releaseExpiredRooms === 'function') {
        releaseExpiredRooms().catch(() => {});
        setInterval(() => {
            releaseExpiredRooms().catch((e) => console.error('auto-release rooms:', e.message));
        }, 60 * 1000);
    }
} catch (e) {
    console.warn('Room auto-release scheduler not started:', e.message);
}

// Auto-initialize DB tables on startup
const { initDb } = require('./utils/initDb');
initDb().catch((e) => console.warn('Database auto-init note:', e.message));

app.listen(PORT, '0.0.0.0', () => {
    const _smtpOk = !!(process.env.SMTP_USER && String(process.env.SMTP_PASS || '').replace(/\s+/g, ''));
    console.log(_smtpOk
        ? `✉️  SMTP email ready (user: ${process.env.SMTP_USER})`
        : '⚠️  SMTP not configured — OTP will only print in this console. Set SMTP_USER and SMTP_PASS in backend/.env');
    console.log(`🚀 Server running on port ${PORT}`);
});