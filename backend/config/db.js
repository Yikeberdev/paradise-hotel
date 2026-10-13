const mysql = require('mysql2');
const config = require('./config');

let poolConfig = {};

if (config.db.url) {
    try {
        const parsed = new URL(config.db.url);
        poolConfig = {
            host: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port, 10) : 3306,
            user: decodeURIComponent(parsed.username || 'root'),
            password: decodeURIComponent(parsed.password || ''),
            database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'paradise_hotel',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: config.db.ssl === 'false' ? undefined : { rejectUnauthorized: false }
        };
    } catch (_) {
        poolConfig = {
            uri: config.db.url,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: config.db.ssl === 'false' ? undefined : { rejectUnauthorized: false }
        };
    }
} else {
    const isRemote = config.db.host && config.db.host !== 'localhost' && config.db.host !== '127.0.0.1';
    const enableSsl = config.db.ssl === 'true' || config.db.ssl === '1' || (process.env.NODE_ENV === 'production' && isRemote && config.db.ssl !== 'false');

    poolConfig = {
        host: config.db.host,
        port: config.db.port || 3306,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ...(enableSsl ? { ssl: { rejectUnauthorized: false } } : {})
    };
}

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Verify DB reachable at startup and log status
(async () => {
    const dbTarget = config.db.url ? 'Cloud URI' : `${config.db.database}@${poolConfig.host}:${poolConfig.port}`;
    try {
        const conn = await promisePool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        console.log(`✅ Database connected (${dbTarget})`);
    } catch (err) {
        console.error('\n❌ Could not connect to the database. Register/login/data loading will fail until this is fixed.');
        console.error(`   Target: ${dbTarget}`);
        console.error(`   Reason: ${err.code || err.message}`);

        if (err.code === 'ECONNREFUSED') {
            console.error(`   -> Database server is not running or not listening on ${poolConfig.host}:${poolConfig.port}.`);
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   -> DB credentials (user/password) are incorrect for this database.');
        } else if (err.code === 'ER_BAD_DB_ERROR') {
            console.error(`   -> Database "${poolConfig.database}" does not exist yet.`);
        } else if (err.code === 'ENOTFOUND') {
            console.error('   -> DB host cannot be resolved. Check DB_HOST or DATABASE_URL.');
        } else {
            console.error('   -> Check DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, DB_PORT in your environment settings.');
        }
        console.error('');
    }
})();

module.exports = promisePool;
