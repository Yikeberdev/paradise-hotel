const mysql = require('mysql2');
const config = require('./config');

const pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// Verify the DB is actually reachable as soon as the app boots.
// Without this, a bad host/user/password/database or a MySQL server
// that isn't running silently breaks EVERY route that touches the
// database (register, login, loading rooms/desks/food, etc.) and
// each one just shows a generic "500 Internal Server Error" with no
// clue why. This prints the real reason to the backend terminal.
(async () => {
    try {
        const conn = await promisePool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        console.log(`✅ Database connected (${config.db.database}@${config.db.host})`);
    } catch (err) {
        console.error('\n❌ Could not connect to the database. Register/login/data loading will all fail until this is fixed.');
        console.error(`   Reason: ${err.code || err.message}`);

        if (err.code === 'ECONNREFUSED') {
            console.error('   -> MySQL/MariaDB is not running (or not listening on', `${config.db.host}`, '). Start your MySQL server and try again.');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   -> DB_USER / DB_PASSWORD in backend/.env are wrong for this MySQL server.');
        } else if (err.code === 'ER_BAD_DB_ERROR') {
            console.error(`   -> The "${config.db.database}" database does not exist yet. Run:`);
            console.error('        mysql -u root -p < database/paradise_hotel.sql');
            console.error('      then (optionally) migration_v2.sql and migration_v3.sql.');
        } else if (err.code === 'ENOTFOUND') {
            console.error('   -> DB_HOST in backend/.env cannot be resolved. Check the value.');
        } else {
            console.error('   -> Double-check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in backend/.env and that the schema/migrations have been imported.');
        }
        console.error('');
    }
})();

module.exports = promisePool;
