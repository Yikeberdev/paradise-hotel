require('dotenv').config();

module.exports = {
    port: process.env.PORT || 5000,
    jwtSecret: (() => {
        const s = process.env.JWT_SECRET;
        if (s && String(s).length >= 16) return s;
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET must be set (16+ characters) in production');
        }
        return s || 'dev-only-change-me-in-production';
    })(),
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'paradise_hotel'
    },
    cbe: {
        accountNumber: process.env.CBE_ACCOUNT_NUMBER || '1000532238122',
        accountName: process.env.CBE_ACCOUNT_NAME || 'Paradise Hotel',
        bankName: process.env.CBE_BANK_NAME || 'Commercial Bank of Ethiopia'
    },
    telebirr: {
        phoneNumber: process.env.TELEBIRR_NUMBER || '0920439009',
        accountName: process.env.TELEBIRR_NAME || 'Paradise Hotel'
    },
    currency: process.env.CURRENCY || 'ETB'
};
