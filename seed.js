const db = require('./backend/config/db');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    console.log('🌱 Seeding database...');

    try {
        // Clear existing data
        await db.execute('SET FOREIGN_KEY_CHECKS = 0');
        await db.execute('TRUNCATE TABLE audit_logs');
        await db.execute('TRUNCATE TABLE refund_requests');
        await db.execute('TRUNCATE TABLE payments');
        await db.execute('TRUNCATE TABLE notifications');
        await db.execute('TRUNCATE TABLE comments');
        await db.execute('TRUNCATE TABLE food_order_items');
        await db.execute('TRUNCATE TABLE food_orders');
        await db.execute('TRUNCATE TABLE desk_reservations');
        await db.execute('TRUNCATE TABLE room_reservations');
        await db.execute('TRUNCATE TABLE food_menu');
        await db.execute('TRUNCATE TABLE desks');
        await db.execute('TRUNCATE TABLE rooms');
        await db.execute('TRUNCATE TABLE employees');
        await db.execute('TRUNCATE TABLE customers');
        await db.execute('TRUNCATE TABLE users');
        await db.execute('SET FOREIGN_KEY_CHECKS = 1');

        console.log('✅ Tables cleared');

        // Create users
        const users = [
            { username: 'admin', password: 'admin123', role: 'admin', page: 'admin', email: 'admin@paradisehotel.com', firstName: 'Admin', lastName: 'User', phone: '0911000001' },
            { username: 'manager', password: 'manager123', role: 'manager', page: 'manager', email: 'manager@paradisehotel.com', firstName: 'Manager', lastName: 'User', phone: '0911000002' },
            { username: 'receptionist', password: 'reception123', role: 'receptionist', page: 'receptionist', email: 'receptionist@paradisehotel.com', firstName: 'Reception', lastName: 'Staff', phone: '0911000003' },
            { username: 'customer1', password: 'customer123', role: 'customer', page: 'index', email: 'john@email.com', firstName: 'John', lastName: 'Doe', phone: '0912345678' },
            { username: 'customer2', password: 'customer123', role: 'customer', page: 'index', email: 'jane@email.com', firstName: 'Jane', lastName: 'Smith', phone: '0987654321' },
        ];

        for (const user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            await db.execute(
                'INSERT INTO users (username, email, first_name, last_name, phone, password, role, page) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [user.username, user.email, user.firstName, user.lastName, user.phone, hashedPassword, user.role, user.page]
            );
            console.log(`   ✅ Created user: ${user.username}`);
        }

        // Get user IDs
        const [adminRow] = await db.execute('SELECT id FROM users WHERE username = "admin"');
        const [managerRow] = await db.execute('SELECT id FROM users WHERE username = "manager"');
        const [receptionistRow] = await db.execute('SELECT id FROM users WHERE username = "receptionist"');
        const [customer1Row] = await db.execute('SELECT id FROM users WHERE username = "customer1"');
        const [customer2Row] = await db.execute('SELECT id FROM users WHERE username = "customer2"');

        const adminId = adminRow[0].id;
        const managerId = managerRow[0].id;
        const receptionistId = receptionistRow[0].id;
        const customer1Id = customer1Row[0].id;
        const customer2Id = customer2Row[0].id;

        // Create customers
        const customers = [
            [customer1Id, 'John', 'Doe', 'john@email.com', '0912345678', 'Addis Ababa, Ethiopia', 'Male', 30],
            [customer2Id, 'Jane', 'Smith', 'jane@email.com', '0987654321', 'Debre Markos, Ethiopia', 'Female', 25],
        ];

        for (const cust of customers) {
            await db.execute(
                'INSERT INTO customers (user_id, first_name, last_name, email, phone, address, sex, age) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                cust
            );
            console.log(`   ✅ Created customer: ${cust[1]} ${cust[2]}`);
        }

        // Create employees
        const employees = [
            [adminId, 'Admin User', 'admin', 15000, 'admin@paradise.com', '0911111111', 'Debre Markos', 'active'],
            [managerId, 'Manager User', 'manager', 12000, 'manager@paradise.com', '0922222222', 'Debre Markos', 'active'],
            [receptionistId, 'Receptionist User', 'receptionist', 8000, 'receptionist@paradise.com', '0933333333', 'Debre Markos', 'active'],
        ];

        for (const emp of employees) {
            await db.execute(
                'INSERT INTO employees (user_id, full_name, position, salary, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                emp
            );
            console.log(`   ✅ Created employee: ${emp[1]}`);
        }

        // Create rooms
        const rooms = [
            ['101', 'Single', 'Comfortable single room with city view', 1500, 1, 'available', 'WiFi, TV, AC'],
            ['102', 'Single', 'Single room with garden view', 1600, 1, 'available', 'WiFi, TV, AC'],
            ['201', 'Double', 'Spacious double room with balcony', 2500, 2, 'available', 'WiFi, TV, AC, Balcony'],
            ['202', 'Double', 'Double room with mountain view', 2700, 2, 'available', 'WiFi, TV, AC'],
            ['301', 'Suite', 'Luxury suite with living room', 4500, 4, 'available', 'WiFi, TV, AC, Living Room, Jacuzzi'],
            ['302', 'Twin', 'Twin bed room', 2200, 2, 'available', 'WiFi, TV, AC, Twin Beds'],
            ['303', 'Family', 'Family room with 2 bedrooms', 4000, 5, 'available', 'WiFi, TV, AC, Interconnecting Rooms'],
            ['304', 'Deluxe', 'Deluxe room with panoramic view', 3500, 3, 'available', 'WiFi, TV, AC, Panoramic View'],
        ];

        for (const room of rooms) {
            await db.execute(
                'INSERT INTO rooms (room_number, room_type, description, price_per_night, capacity, status, amenities) VALUES (?, ?, ?, ?, ?, ?, ?)',
                room
            );
            console.log(`   ✅ Created room: ${room[0]}`);
        }

        // Create desks (price = hourly rate charged only when reserved without a food order)
        const desks = [
            ['D01', 4, 'Main Hall - Window', 'available', 50, 'Near window with great view'],
            ['D02', 2, 'Main Hall - Center', 'available', 40, 'Cozy table for two'],
            ['D03', 6, 'Terrace - Outdoor', 'available', 70, 'Outdoor seating'],
            ['D04', 4, 'VIP Area', 'available', 100, 'VIP premium service'],
            ['D05', 8, 'Main Hall - Corner', 'available', 90, 'Large table for groups'],
        ];

        for (const desk of desks) {
            await db.execute(
                'INSERT INTO desks (desk_number, capacity, location, status, price, description) VALUES (?, ?, ?, ?, ?, ?)',
                desk
            );
            console.log(`   ✅ Created desk: ${desk[0]}`);
        }

        // Create food menu
        const menuItems = [
            ['Ethiopian Breakfast', 'Breakfast', 'Traditional Ethiopian breakfast with coffee', 250, 'available', 1],
            ['Continental Breakfast', 'Breakfast', 'Toast, eggs, juice, coffee', 300, 'available', 0],
            ['Doro Wat', 'Main Course', 'Spicy chicken stew with injera', 350, 'available', 1],
            ['Kitfo', 'Main Course', 'Minced raw beef with spices', 400, 'available', 1],
            ['Vegetable Platter', 'Vegetarian', 'Assorted vegetarian dishes', 280, 'available', 0],
            ['Tibs', 'Main Course', 'Sautéed beef with vegetables', 380, 'available', 0],
            ['Spaghetti', 'International', 'Spaghetti with meat sauce', 300, 'available', 0],
            ['Fanta', 'Beverage', 'Orange soda', 50, 'available', 0],
            ['Coca Cola', 'Beverage', 'Classic cola', 50, 'available', 0],
            ['Spring Water', 'Beverage', 'Mineral water', 30, 'available', 0],
            ['Coffee', 'Beverage', 'Ethiopian coffee', 40, 'available', 1],
        ];

        for (const item of menuItems) {
            await db.execute(
                'INSERT INTO food_menu (item_name, category, description, price, availability, is_special) VALUES (?, ?, ?, ?, ?, ?)',
                item
            );
            console.log(`   ✅ Created menu item: ${item[0]}`);
        }

        console.log('\n✅ Database seeding completed successfully!');
        console.log('\n🔑 Default Login Credentials:');
        console.log('   Admin: admin / admin123');
        console.log('   Manager: manager / manager123');
        console.log('   Receptionist: receptionist / reception123');
        console.log('   Customer: customer1 / customer123');
        console.log('\n🏦 CBE Birr Payment Account:');
        console.log(`   Account: ${process.env.CBE_ACCOUNT_NUMBER || '1000532238122'}`);
        console.log(`   Name: ${process.env.CBE_ACCOUNT_NAME || 'Paradise Hotel'}`);
        console.log('\n📱 Telebirr Payment:');
        console.log(`   Number: ${process.env.TELEBIRR_NUMBER || '0920439009'}`);
        console.log(`   Name: ${process.env.TELEBIRR_NAME || 'Paradise Hotel'}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed error:', error);
        process.exit(1);
    }
}

seedDatabase();