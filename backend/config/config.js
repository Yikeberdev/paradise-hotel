const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

module.exports = {
    port: process.env.PORT || 5000,
    jwtSecret: (() => {
        const s = process.env.JWT_SECRET;
        if (s && String(s).length >= 16) return s;
        if (s) {
            console.warn('⚠️ [Config] JWT_SECRET is shorter than 16 characters. For best security, use a longer secret.');
            return s;
        }
        if (process.env.NODE_ENV === 'production') {
            console.warn('⚠️ [Config] JWT_SECRET is not set in production. Using fallback secret. Please configure JWT_SECRET in your platform environment variables.');
        }
        return 'paradise_hotel_secret_key_prod_default_2026';
    })(),
    db: {
        url: process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.JAWSDB_URL || process.env.CLEARDB_DATABASE_URL || '',
        host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
        user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
        database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'paradise_hotel',
        ssl: process.env.DB_SSL
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
