-- Create database
CREATE DATABASE IF NOT EXISTS paradise_hotel;
USE paradise_hotel;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'receptionist', 'customer') DEFAULT 'customer',
    page VARCHAR(50) DEFAULT 'index',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Employees table
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    full_name VARCHAR(100) NOT NULL,
    position VARCHAR(50) NOT NULL,
    salary DECIMAL(10,2),
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    status ENUM('active', 'inactive', 'on_leave') DEFAULT 'active',
    hire_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Rooms table
CREATE TABLE rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_number VARCHAR(20) UNIQUE NOT NULL,
    room_type ENUM('Single', 'Double', 'Twin', 'Suite', 'Family', 'Deluxe') NOT NULL,
    description TEXT,
    price_per_night DECIMAL(10,2) NOT NULL,
    capacity INT DEFAULT 2,
    status ENUM('available', 'booked', 'maintenance') DEFAULT 'available',
    image VARCHAR(255) DEFAULT 'room-default.jpg',
    amenities TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room reservations table
CREATE TABLE room_reservations (
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
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Desks table
CREATE TABLE desks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    desk_number VARCHAR(20) UNIQUE NOT NULL,
    capacity INT NOT NULL,
    location VARCHAR(100),
    status ENUM('available', 'reserved') DEFAULT 'available',
    price DECIMAL(10,2) DEFAULT 0 COMMENT 'Hourly rate charged when desk is reserved without a food order',
    description TEXT,
    image VARCHAR(255) DEFAULT 'desk-default.jpg',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Desk reservations table
CREATE TABLE desk_reservations (
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
    FOREIGN KEY (desk_id) REFERENCES desks(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Food menu table
CREATE TABLE food_menu (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    category ENUM('Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International', 'Appetizer') NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    availability ENUM('available', 'unavailable') DEFAULT 'available',
    image VARCHAR(255) DEFAULT 'food-default.jpg',
    is_special BOOLEAN DEFAULT FALSE,
    ingredients TEXT,
    preparation_time INT DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Food orders table
CREATE TABLE food_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    order_type ENUM('room', 'desk', 'takeaway', 'delivery') NOT NULL,
    reference_id INT,
    desk_reservation_id INT NULL,
    is_free TINYINT(1) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'approved', 'preparing', 'ready', 'served', 'cancelled', 'delivered') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
    payment_reference VARCHAR(100),
    rejection_reason VARCHAR(255),
    special_instructions TEXT,
    delivery_address TEXT,
    is_read TINYINT(1) DEFAULT 0,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (desk_reservation_id) REFERENCES desk_reservations(id)
);

-- Food order items table
CREATE TABLE food_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    menu_id INT,
    quantity INT NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    special_instructions TEXT,
    FOREIGN KEY (order_id) REFERENCES food_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_id) REFERENCES food_menu(id)
);

-- Comments table
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    username VARCHAR(50),
    job_title VARCHAR(100),
    photo VARCHAR(255),
    feedback TEXT NOT NULL,
    rating INT DEFAULT 5,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Payments table
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT,
    amount DECIMAL(10,2) NOT NULL,
    payment_type ENUM('room', 'desk', 'food') NOT NULL,
    payment_method ENUM('cbe_birr', 'telebirr', 'bank_transfer', 'cash') DEFAULT 'cbe_birr',
    account_number VARCHAR(50),
    account_name VARCHAR(100),
    transaction_id VARCHAR(100),
    receipt_image VARCHAR(255),
    reservation_type ENUM('room', 'desk', 'food'),
    reservation_id INT,
    status ENUM('pending', 'completed', 'failed', 'approved', 'verified', 'rejected', 'refunded') DEFAULT 'pending',
    rejection_reason VARCHAR(255),
    verified_by INT,
    verified_at TIMESTAMP NULL,
    notes TEXT,
    is_read TINYINT(1) DEFAULT 0,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Refund Requests table
CREATE TABLE refund_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    reservation_type ENUM('room', 'desk', 'food') NOT NULL,
    reservation_id INT NOT NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    penalty_percentage DECIMAL(5,2) NOT NULL,
    penalty_amount DECIMAL(10,2) NOT NULL,
    refund_amount DECIMAL(10,2) NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    rejection_reason VARCHAR(255),
    processed_by INT,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Audit Logs table
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Notifications table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    type VARCHAR(50),
    title VARCHAR(150),
    message TEXT,
    link VARCHAR(255),
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Insert default users (FIXED bcrypt hashes - see credentials below, generated with bcryptjs so they are
-- guaranteed to match what the Node backend checks against)
-- admin / admin123
-- manager / manager123
-- receptionist / reception123
-- customer1 / customer123
-- customer2 / customer123
INSERT INTO users (username, email, first_name, last_name, phone, password, role, page) VALUES
('admin', 'admin@paradisehotel.com', 'Admin', 'User', '0911000001', '$2a$10$M85NFtreAzab4Ug0E2w96u8tM0nF22NiLgH6lo4jVOLdXj1NQwNKG', 'admin', 'admin'),
('manager', 'manager@paradisehotel.com', 'Manager', 'User', '0911000002', '$2a$10$JWH4N5fUDnXECnMUJ8oJVuRPDo.UN1Owx1sqHCrLuP7hgkVDuTSLu', 'manager', 'manager'),
('receptionist', 'receptionist@paradisehotel.com', 'Reception', 'Staff', '0911000003', '$2a$10$r30fioU5lsJNDzuFrBwBdurU9IuwRqsiTXZlwhdMmeyC3oHMGagPO', 'receptionist', 'receptionist'),
('customer1', 'customer1@example.com', 'Abebe', 'Kebede', '0911000004', '$2a$10$0hqBYJ4QQO4.MeWyqbt11.pUa1b1ogg.5MFIecPnMUzNSQDmR5idi', 'customer', 'index'),
('customer2', 'customer2@example.com', 'Sara', 'Alemu', '0911000005', '$2a$10$DmBtPub0F0B3cy9S8ktweeV.n0QkrbYyQqLar0hScYvKuVLB3Xz6y', 'customer', 'index');

-- Insert sample rooms (Ethiopian Birr)
INSERT INTO rooms (room_number, room_type, description, price_per_night, capacity, status, amenities) VALUES
('101', 'Single', 'Comfortable single room with city view', 1500.00, 1, 'available', 'WiFi, TV, AC, Mini Bar'),
('102', 'Single', 'Single room with beautiful garden view', 1600.00, 1, 'available', 'WiFi, TV, AC, Garden View'),
('201', 'Double', 'Spacious double room with private balcony', 2500.00, 2, 'available', 'WiFi, TV, AC, Balcony, Mini Bar, Bathtub'),
('202', 'Double', 'Double room with stunning mountain view', 2700.00, 2, 'available', 'WiFi, TV, AC, Mountain View, Bathtub'),
('301', 'Suite', 'Luxury suite with separate living room', 4500.00, 4, 'available', 'WiFi, TV, AC, Living Room, Kitchenette, Jacuzzi'),
('302', 'Twin', 'Twin bed room with two comfortable beds', 2200.00, 2, 'available', 'WiFi, TV, AC, Twin Beds'),
('303', 'Family', 'Family room with 2 interconnected bedrooms', 4000.00, 5, 'available', 'WiFi, TV, AC, Interconnecting Rooms, Mini Bar'),
('304', 'Deluxe', 'Deluxe room with premium furnishings', 3500.00, 3, 'available', 'WiFi, TV, AC, Panoramic View, Bathtub');

-- Insert sample desks
INSERT INTO desks (desk_number, capacity, location, status, price, description) VALUES
('D01', 4, 'Main Hall - Window Section', 'available', 50, 'Perfect for small groups, near window'),
('D02', 2, 'Main Hall - Center Section', 'available', 40, 'Cozy table for two in the center'),
('D03', 6, 'Terrace - Outdoor', 'available', 70, 'Large table on the terrace'),
('D04', 4, 'VIP Area', 'available', 100, 'VIP section with premium service'),
('D05', 8, 'Main Hall - Corner Section', 'available', 90, 'Large corner table for groups');

-- Insert sample food menu
INSERT INTO food_menu (item_name, category, description, price, availability, is_special) VALUES
('Ethiopian Breakfast', 'Breakfast', 'Traditional Ethiopian breakfast with coffee', 250.00, 'available', 1),
('Continental Breakfast', 'Breakfast', 'Toast, eggs, juice, and coffee', 300.00, 'available', 0),
('Doro Wat', 'Main Course', 'Spicy chicken stew with injera', 350.00, 'available', 1),
('Kitfo', 'Main Course', 'Minced raw beef with Ethiopian spices', 400.00, 'available', 1),
('Vegetable Platter', 'Vegetarian', 'Assorted vegetarian dishes with injera', 280.00, 'available', 0),
('Tibs', 'Main Course', 'Sautéed beef with vegetables', 380.00, 'available', 0),
('Spaghetti', 'International', 'Spaghetti with meat sauce', 300.00, 'available', 0),
('Fanta', 'Beverage', 'Orange soda', 50.00, 'available', 0),
('Coca Cola', 'Beverage', 'Classic cola', 50.00, 'available', 0),
('Spring Water', 'Beverage', 'Mineral water', 30.00, 'available', 0),
('Coffee', 'Beverage', 'Fresh Ethiopian coffee', 40.00, 'available', 1);