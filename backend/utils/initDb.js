const db = require('../config/db');
const bcrypt = require('bcryptjs');

/**
 * Automatically creates all tables and migrations if they don't exist.
 * Safe to run multiple times (idempotent).
 */
async function initDb() {
    try {
        console.log('🔄 Checking database tables...');

        // 1. Users table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE,
                first_name VARCHAR(50),
                last_name VARCHAR(50),
                phone VARCHAR(20),
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'manager', 'receptionist', 'customer') DEFAULT 'customer',
                status ENUM('active','suspended','inactive') DEFAULT 'active',
                last_login TIMESTAMP NULL,
                last_active TIMESTAMP NULL,
                profile_image VARCHAR(255) DEFAULT NULL,
                address TEXT DEFAULT NULL,
                page VARCHAR(50) DEFAULT 'index',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Ensure users columns in case created by older schema
        const userCols = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS status ENUM('active','suspended','inactive') DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS page VARCHAR(50) DEFAULT 'index'"
        ];
        for (const sql of userCols) {
            try { await db.execute(sql); } catch (_) {}
        }

        // 2. Customers table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
                email VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                address TEXT,
                country VARCHAR(100),
                region VARCHAR(100),
                zone VARCHAR(100),
                wereda VARCHAR(100),
                kebele VARCHAR(100),
                id_card_image VARCHAR(255),
                sex ENUM('Male', 'Female', 'Other'),
                age INT,
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (email)
            )
        `);

        // 3. Employees table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                full_name VARCHAR(100) NOT NULL,
                position VARCHAR(50) NOT NULL,
                salary DECIMAL(10,2),
                email VARCHAR(100),
                phone VARCHAR(20),
                address TEXT,
                status ENUM('active', 'inactive', 'on_leave') DEFAULT 'active',
                hire_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            )
        `);

        // 4. Rooms table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS rooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_number VARCHAR(20) UNIQUE NOT NULL,
                room_type ENUM('Single', 'Double', 'Twin', 'Suite', 'Family', 'Deluxe') NOT NULL,
                description TEXT,
                price_per_night DECIMAL(10,2) NOT NULL,
                capacity INT DEFAULT 2,
                status ENUM('available', 'booked', 'reserved', 'pending', 'maintenance') DEFAULT 'available',
                image VARCHAR(255) DEFAULT 'room-default.jpg',
                amenities TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            await db.execute("ALTER TABLE rooms MODIFY COLUMN status ENUM('available','booked','reserved','pending','maintenance') DEFAULT 'available'");
        } catch (_) {}

        // 5. Room reservations table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS room_reservations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id INT,
                customer_id INT,
                guest_name VARCHAR(100) NOT NULL,
                guest_phone VARCHAR(20),
                guest_email VARCHAR(100),
                check_in_date DATE NOT NULL,
                check_out_date DATE NOT NULL,
                number_of_guests INT DEFAULT 1,
                total_price DECIMAL(10,2) NOT NULL,
                country VARCHAR(100),
                region VARCHAR(100),
                zone VARCHAR(100),
                wereda VARCHAR(100),
                kebele VARCHAR(100),
                id_card_image VARCHAR(255),
                status ENUM('pending', 'approved', 'rejected', 'checked_in', 'checked_out', 'cancelled') DEFAULT 'pending',
                payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
                payment_reference VARCHAR(100),
                rejection_reason VARCHAR(255),
                special_requests TEXT,
                is_read TINYINT(1) DEFAULT 0,
                reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (room_id),
                INDEX (customer_id)
            )
        `);

        // 6. Desks table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS desks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                desk_number VARCHAR(20) UNIQUE NOT NULL,
                capacity INT NOT NULL,
                location VARCHAR(100),
                status ENUM('available', 'reserved', 'pending') DEFAULT 'available',
                price DECIMAL(10,2) DEFAULT 0,
                description TEXT,
                image VARCHAR(255) DEFAULT 'desk-default.jpg',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            await db.execute("ALTER TABLE desks MODIFY COLUMN status ENUM('available','reserved','pending') DEFAULT 'available'");
        } catch (_) {}

        // 7. Desk reservations table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS desk_reservations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                desk_id INT,
                customer_id INT,
                guest_name VARCHAR(100) NOT NULL,
                guest_phone VARCHAR(20),
                guest_email VARCHAR(100),
                reservation_date DATE NOT NULL,
                time_slot ENUM('breakfast', 'lunch', 'dinner', 'any') NOT NULL,
                start_time DATETIME NULL,
                end_time DATETIME NULL,
                duration_hours DECIMAL(6,2) DEFAULT 0,
                is_free_with_food TINYINT(1) DEFAULT 0,
                amount DECIMAL(10,2) DEFAULT 0,
                party_size INT NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'completed', 'cancelled') DEFAULT 'pending',
                payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
                payment_reference VARCHAR(100),
                rejection_reason VARCHAR(255),
                special_requests TEXT,
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (desk_id),
                INDEX (customer_id)
            )
        `);

        // 8. Food menu table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS food_menu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                item_name VARCHAR(100) NOT NULL,
                category ENUM('Breakfast','Lunch','Dinner','Beverage','Dessert','Fast Food','Traditional Food','Main Course','Vegetarian','International','Appetizer') NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                availability ENUM('available', 'unavailable') DEFAULT 'available',
                image VARCHAR(255) DEFAULT 'food-default.jpg',
                is_special BOOLEAN DEFAULT FALSE,
                ingredients TEXT,
                preparation_time INT DEFAULT 15,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 9. Food orders table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS food_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT,
                order_type ENUM('room', 'desk', 'takeaway', 'delivery') NOT NULL,
                reference_id INT,
                desk_reservation_id INT NULL,
                is_free TINYINT(1) DEFAULT 0,
                room_number VARCHAR(20),
                desk_number VARCHAR(20),
                delivery_address TEXT,
                delivery_type ENUM('delivery','pickup') DEFAULT 'pickup',
                special_instructions TEXT,
                total_amount DECIMAL(10,2) NOT NULL,
                status ENUM('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled') DEFAULT 'pending',
                payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
                payment_reference VARCHAR(100),
                is_read TINYINT(1) DEFAULT 0,
                order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (customer_id)
            )
        `);
        try {
            await db.execute("ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS delivery_type ENUM('delivery','pickup') DEFAULT 'pickup'");
        } catch (_) {}

        // 10. Food order items table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS food_order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT,
                food_id INT,
                quantity INT NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                subtotal DECIMAL(10,2) NOT NULL,
                INDEX (order_id),
                INDEX (food_id)
            )
        `);

        // 11. Comments / Reviews table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                customer_id INT,
                comment_type ENUM('room', 'food', 'desk', 'general') NOT NULL,
                reference_id INT,
                rating INT CHECK (rating >= 1 AND rating <= 5),
                comment_text TEXT NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
                reply_text TEXT,
                replied_by INT,
                replied_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (customer_id)
            )
        `);

        // 12. Notifications table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                title VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('reservation', 'order', 'payment', 'system', 'refund', 'approval') NOT NULL,
                reference_id INT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            )
        `);

        // 13. Payments table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT,
                reference_number VARCHAR(50) NOT NULL,
                payment_type VARCHAR(50) NOT NULL,
                payment_method VARCHAR(100) NOT NULL DEFAULT 'cbe_birr',
                account_number VARCHAR(512),
                account_name VARCHAR(100),
                transaction_id VARCHAR(100),
                reservation_type ENUM('room', 'desk', 'food'),
                reservation_id INT,
                amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                rejection_reason VARCHAR(255),
                receipt_image VARCHAR(255),
                notes TEXT,
                is_read TINYINT(1) DEFAULT 0,
                verified_by INT,
                verified_at TIMESTAMP NULL,
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_payments_reference_number (reference_number),
                INDEX (customer_id)
            )
        `);

        // Upgrade payment tables created by older versions without discarding legacy columns or rows.
        const [paymentColumns] = await db.execute('SHOW COLUMNS FROM payments');
        const paymentColumnNames = new Set(paymentColumns.map((column) => column.Field));
        const addPaymentColumn = async (name, definition) => {
            if (!paymentColumnNames.has(name)) {
                await db.execute(`ALTER TABLE payments ADD COLUMN ${name} ${definition}`);
                paymentColumnNames.add(name);
            }
        };
        await addPaymentColumn('reference_number', 'VARCHAR(50) NULL');
        await addPaymentColumn('payment_method', "VARCHAR(100) NOT NULL DEFAULT 'cbe_birr'");
        await addPaymentColumn('account_number', 'VARCHAR(512) NULL');
        await addPaymentColumn('account_name', 'VARCHAR(100) NULL');
        await addPaymentColumn('transaction_id', 'VARCHAR(100) NULL');
        await addPaymentColumn('reservation_type', "ENUM('room', 'desk', 'food') NULL");
        await addPaymentColumn('reservation_id', 'INT NULL');
        await addPaymentColumn('status', "VARCHAR(30) NOT NULL DEFAULT 'pending'");
        await addPaymentColumn('rejection_reason', 'VARCHAR(255) NULL');
        await addPaymentColumn('is_read', 'TINYINT(1) DEFAULT 0');

        const [paymentColumnTypes] = await db.execute('SHOW COLUMNS FROM payments');
        const paymentColumnTypeByName = new Map(paymentColumnTypes.map((column) => [column.Field, column.Type]));
        if (!paymentColumnTypeByName.get('payment_type').startsWith('varchar')) {
            await db.execute('ALTER TABLE payments MODIFY COLUMN payment_type VARCHAR(50) NOT NULL');
        }
        if (!paymentColumnTypeByName.get('payment_method').startsWith('varchar')) {
            await db.execute("ALTER TABLE payments MODIFY COLUMN payment_method VARCHAR(100) NOT NULL DEFAULT 'cbe_birr'");
        }
        if (!paymentColumnTypeByName.get('status').startsWith('varchar')) {
            await db.execute("ALTER TABLE payments MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending'");
        }
        await db.execute(
            "UPDATE payments SET reference_number = CONCAT('LEGACY-', id) WHERE reference_number IS NULL OR reference_number = ''"
        );
        if (paymentColumnNames.has('transaction_reference')) {
            await db.execute(
                "UPDATE payments SET transaction_id = transaction_reference WHERE (transaction_id IS NULL OR transaction_id = '') AND transaction_reference IS NOT NULL"
            );
        }
        if (paymentColumnNames.has('reference_id')) {
            await db.execute(
                'UPDATE payments SET reservation_id = reference_id WHERE reservation_id IS NULL AND reference_id IS NOT NULL'
            );
        }
        await db.execute(
            `UPDATE payments SET reservation_type = CASE payment_type
                WHEN 'room_reservation' THEN 'room'
                WHEN 'desk_reservation' THEN 'desk'
                WHEN 'food_order' THEN 'food'
                ELSE payment_type
            END
            WHERE reservation_type IS NULL AND payment_type IN ('room', 'desk', 'food', 'room_reservation', 'desk_reservation', 'food_order')`
        );
        if (paymentColumnNames.has('payment_status')) {
            await db.execute(
                "UPDATE payments SET status = payment_status WHERE status = 'pending' AND payment_status <> 'pending'"
            );
        }
        await db.execute('ALTER TABLE payments MODIFY COLUMN reference_number VARCHAR(50) NOT NULL');
        const [paymentIndexes] = await db.execute('SHOW INDEX FROM payments');
        if (!paymentIndexes.some((index) => index.Column_name === 'reference_number' && index.Non_unique === 0)) {
            await db.execute(
                'ALTER TABLE payments ADD UNIQUE INDEX uq_payments_reference_number (reference_number)'
            );
        }

        // 14. Refund requests table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS refund_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payment_id INT,
                customer_id INT,
                requested_amount DECIMAL(10,2) NOT NULL,
                refund_amount DECIMAL(10,2),
                deduction_percentage DECIMAL(5,2) DEFAULT 0,
                deduction_amount DECIMAL(10,2) DEFAULT 0,
                reason TEXT NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
                processed_by INT,
                processed_at TIMESTAMP NULL,
                bank_name VARCHAR(100),
                account_number VARCHAR(50),
                account_holder_name VARCHAR(100),
                telebirr_phone VARCHAR(20),
                refund_method ENUM('cbe_birr', 'telebirr', 'bank_transfer') NOT NULL,
                transaction_reference VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (payment_id),
                INDEX (customer_id)
            )
        `);

        // 15. Audit logs table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                action VARCHAR(100) NOT NULL,
                table_affected VARCHAR(50),
                record_id INT,
                old_values JSON,
                new_values JSON,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (created_at)
            )
        `);

        // 16. Discounts table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS discounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                discount_percentage DECIMAL(5,2) NOT NULL,
                discount_type ENUM('food','room','desk','all') NOT NULL,
                target_category VARCHAR(100) DEFAULT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                start_time TIME DEFAULT '00:00:00',
                end_time TIME DEFAULT '23:59:59',
                is_active TINYINT(1) DEFAULT 1,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (is_active)
            )
        `);

        // 17. Delete approval requests
        await db.execute(`
            CREATE TABLE IF NOT EXISTS delete_approval_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                target_user_id INT NOT NULL,
                requested_by INT NOT NULL,
                reason TEXT,
                status ENUM('pending','approved','rejected') DEFAULT 'pending',
                processed_by INT DEFAULT NULL,
                processed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (status)
            )
        `);

        // 18. Bank accounts
        await db.execute(`
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                owner_type ENUM('hotel','customer') DEFAULT 'customer',
                customer_id INT NULL,
                bank_name VARCHAR(100) NOT NULL,
                bank_code VARCHAR(50) NULL,
                account_number VARCHAR(512) NULL,
                account_number_hash VARCHAR(64) NULL,
                account_username VARCHAR(100) NULL,
                account_holder_name VARCHAR(100) NULL,
                currency VARCHAR(10) DEFAULT 'ETB',
                balance VARCHAR(255) NOT NULL DEFAULT '0',
                is_primary TINYINT(1) DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (customer_id),
                INDEX (account_number_hash)
            )
        `);

        // 19. Site content
        await db.execute(`
            CREATE TABLE IF NOT EXISTS site_content (
                id INT PRIMARY KEY,
                about_title VARCHAR(255) NULL,
                about_body TEXT NULL,
                about_subtitle TEXT NULL,
                about_extra JSON NULL,
                contact_hotel_name VARCHAR(255) NULL,
                contact_address VARCHAR(255) NULL,
                contact_city VARCHAR(100) NULL,
                contact_phone VARCHAR(50) NULL,
                contact_email VARCHAR(120) NULL,
                contact_hours VARCHAR(120) NULL,
                contact_lat DECIMAL(10,7) NULL,
                contact_lng DECIMAL(10,7) NULL,
                contact_socials JSON NULL,
                updated_by INT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 20. Security / intrusion tables
        await db.execute(`
            CREATE TABLE IF NOT EXISTS blocked_ips (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ip VARCHAR(64) NOT NULL,
                reason VARCHAR(500) NOT NULL,
                details TEXT NULL,
                blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NULL,
                active TINYINT(1) NOT NULL DEFAULT 1,
                INDEX (ip),
                INDEX (active)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS security_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ip VARCHAR(64) NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                path VARCHAR(500) NULL,
                method VARCHAR(20) NULL,
                user_agent VARCHAR(500) NULL,
                details TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX (ip),
                INDEX (created_at)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS locked_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                email VARCHAR(255) NOT NULL,
                reason VARCHAR(500) NOT NULL,
                fail_count INT NOT NULL DEFAULT 0,
                locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                unlocked_at DATETIME NULL,
                active TINYINT(1) NOT NULL DEFAULT 1,
                INDEX (email),
                INDEX (active)
            )
        `);

        // Seed initial admin if users table is empty
        const [users] = await db.execute('SELECT id FROM users LIMIT 1');
        if (!users || users.length === 0) {
            console.log('🌱 No users found. Creating default admin & manager accounts...');
            const adminPass = await bcrypt.hash('admin123', 10);
            await db.execute(
                `INSERT INTO users (username, email, first_name, last_name, phone, password, role, page, status)
                 VALUES ('admin', 'admin@paradisehotel.com', 'Admin', 'User', '0911000001', ?, 'admin', 'admin', 'active')`,
                [adminPass]
            );

            const managerPass = await bcrypt.hash('manager123', 10);
            await db.execute(
                `INSERT INTO users (username, email, first_name, last_name, phone, password, role, page, status)
                 VALUES ('manager', 'manager@paradisehotel.com', 'Manager', 'User', '0911000002', ?, 'manager', 'manager', 'active')`,
                [managerPass]
            );

            const recPass = await bcrypt.hash('reception123', 10);
            await db.execute(
                `INSERT INTO users (username, email, first_name, last_name, phone, password, role, page, status)
                 VALUES ('receptionist', 'receptionist@paradisehotel.com', 'Reception', 'Staff', '0911000003', ?, 'receptionist', 'receptionist', 'active')`,
                [recPass]
            );
            console.log('✅ Default accounts created: admin / manager / receptionist');
        }

        // Seed rooms if empty
        const [existingRooms] = await db.execute('SELECT id FROM rooms LIMIT 1');
        if (!existingRooms || existingRooms.length === 0) {
            console.log('🌱 Seeding sample rooms...');
            const sampleRooms = [
                ['101', 'Single', 'Comfortable single room with city view', 1500, 1, 'available', 'WiFi, TV, AC'],
                ['102', 'Single', 'Single room with garden view', 1600, 1, 'available', 'WiFi, TV, AC'],
                ['201', 'Double', 'Spacious double room with balcony', 2500, 2, 'available', 'WiFi, TV, AC, Balcony'],
                ['202', 'Double', 'Double room with mountain view', 2700, 2, 'available', 'WiFi, TV, AC'],
                ['301', 'Suite', 'Luxury suite with living room', 4500, 4, 'available', 'WiFi, TV, AC, Living Room, Jacuzzi'],
                ['302', 'Twin', 'Twin bed room', 2200, 2, 'available', 'WiFi, TV, AC, Twin Beds'],
                ['303', 'Family', 'Family room with 2 bedrooms', 4000, 5, 'available', 'WiFi, TV, AC, Interconnecting Rooms'],
                ['304', 'Deluxe', 'Deluxe room with panoramic view', 3500, 3, 'available', 'WiFi, TV, AC, Panoramic View']
            ];
            for (const r of sampleRooms) {
                try {
                    await db.execute(
                        'INSERT INTO rooms (room_number, room_type, description, price_per_night, capacity, status, amenities) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        r
                    );
                } catch (_) {}
            }
        }

        // Seed desks if empty
        const [existingDesks] = await db.execute('SELECT id FROM desks LIMIT 1');
        if (!existingDesks || existingDesks.length === 0) {
            console.log('🌱 Seeding sample desks...');
            const sampleDesks = [
                ['D01', 4, 'Main Hall - Window', 'available', 50, 'Near window with great view'],
                ['D02', 2, 'Main Hall - Center', 'available', 40, 'Cozy table for two'],
                ['D03', 6, 'Terrace - Outdoor', 'available', 70, 'Outdoor seating'],
                ['D04', 4, 'VIP Area', 'available', 100, 'VIP premium service'],
                ['D05', 8, 'Main Hall - Corner', 'available', 90, 'Large table for groups']
            ];
            for (const d of sampleDesks) {
                try {
                    await db.execute(
                        'INSERT INTO desks (desk_number, capacity, location, status, price, description) VALUES (?, ?, ?, ?, ?, ?)',
                        d
                    );
                } catch (_) {}
            }
        }

        // Seed food menu if empty
        const [existingFood] = await db.execute('SELECT id FROM food_menu LIMIT 1');
        if (!existingFood || existingFood.length === 0) {
            console.log('🌱 Seeding sample food menu...');
            const sampleFood = [
                ['Ethiopian Breakfast', 'Breakfast', 'Traditional Ethiopian breakfast with coffee', 250, 'available', 1],
                ['Continental Breakfast', 'Breakfast', 'Toast, eggs, juice, coffee', 300, 'available', 0],
                ['Doro Wat', 'Traditional Food', 'Spicy chicken stew with injera', 350, 'available', 1],
                ['Kitfo', 'Traditional Food', 'Minced beef with Ethiopian spices', 400, 'available', 1],
                ['Vegetable Platter', 'Lunch', 'Assorted vegetarian dishes', 280, 'available', 0],
                ['Tibs', 'Dinner', 'Sautéed beef with vegetables', 380, 'available', 0],
                ['Burger & Fries', 'Fast Food', 'Juicy beef burger with fresh fries', 260, 'available', 0],
                ['Fanta', 'Beverage', 'Orange soda', 50, 'available', 0],
                ['Coca Cola', 'Beverage', 'Classic cola', 50, 'available', 0],
                ['Spring Water', 'Beverage', 'Mineral water', 30, 'available', 0],
                ['Coffee', 'Beverage', 'Traditional Ethiopian coffee', 40, 'available', 1]
            ];
            for (const f of sampleFood) {
                try {
                    await db.execute(
                        'INSERT INTO food_menu (item_name, category, description, price, availability, is_special) VALUES (?, ?, ?, ?, ?, ?)',
                        f
                    );
                } catch (_) {}
            }
        }

        console.log('✅ Database tables initialized successfully.');
    } catch (err) {
        console.warn('⚠️ [initDb] Note:', err.message);
    }
}

if (require.main === module) {
    initDb().then(() => {
        console.log('Database init complete.');
        process.exit(0);
    }).catch((e) => {
        console.error('Database init failed:', e);
        process.exit(1);
    });
}

module.exports = { initDb };
