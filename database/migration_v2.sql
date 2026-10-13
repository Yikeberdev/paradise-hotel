-- ============================================================
-- Paradise Hotel v2 Migration Script
-- Run this AFTER paradise_hotel.sql has been executed
-- ============================================================

USE paradise_hotel;

-- 1. Add new columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status ENUM('active','suspended','inactive') DEFAULT 'active' AFTER role,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL AFTER status,
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMP NULL AFTER last_login,
  ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL AFTER last_active,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL AFTER phone;

-- 2. Update rooms status enum
ALTER TABLE rooms MODIFY COLUMN status ENUM('available','reserved','pending','maintenance') DEFAULT 'available';

-- 3. Update desks status enum
ALTER TABLE desks MODIFY COLUMN status ENUM('available','reserved','pending') DEFAULT 'available';

-- 4. Migrate existing food_menu categories to new ones before altering enum
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Main Course';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Vegetarian';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'International';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Appetizer';

-- 5. Update food_menu category enum
ALTER TABLE food_menu MODIFY COLUMN category ENUM('Breakfast','Lunch','Dinner','Beverage','Dessert','Fast Food','Traditional Food') NOT NULL;

-- 6. Add food delivery_type to food_orders
ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS delivery_type ENUM('delivery','pickup') DEFAULT 'pickup' AFTER delivery_address;

-- 7. Create discounts table
CREATE TABLE IF NOT EXISTS discounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_percentage DECIMAL(5,2) NOT NULL,
    discount_type ENUM('food','room','desk','all') NOT NULL,
    target_category VARCHAR(100) DEFAULT NULL COMMENT 'Specific room type, food category, desk location, or NULL for all',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    is_active TINYINT(1) DEFAULT 1,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Create delete_approval_requests table
CREATE TABLE IF NOT EXISTS delete_approval_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target_user_id INT NOT NULL,
    requested_by INT NOT NULL COMMENT 'Manager user_id',
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    processed_by INT DEFAULT NULL COMMENT 'Admin user_id who processed',
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 9. Add department column removal from employees (make it optional)
-- We keep it but make it nullable to not break existing data
ALTER TABLE employees MODIFY COLUMN IF EXISTS salary DECIMAL(10,2) DEFAULT NULL;

-- 10. Update existing room reservations to use 'reserved' instead of 'booked'
-- (rooms with 'booked' status => 'reserved')
UPDATE rooms SET status = 'reserved' WHERE status = 'booked';

SELECT 'Migration v2 complete!' as result;
