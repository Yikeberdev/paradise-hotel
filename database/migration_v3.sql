-- ============================================================
-- Paradise Hotel v3 Migration Script
-- Run this AFTER migration_v2.sql has been executed
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

USE paradise_hotel;

-- 1. Ensure users table has all required columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status ENUM('active','suspended','inactive') DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;

-- 2. Fix rooms status ENUM (add reserved, pending, maintenance)
ALTER TABLE rooms MODIFY COLUMN status ENUM('available','reserved','pending','maintenance') DEFAULT 'available';

-- 3. Fix desks status ENUM (add pending)
ALTER TABLE desks MODIFY COLUMN status ENUM('available','reserved','pending') DEFAULT 'available';

-- 4. Migrate old food_menu categories before altering enum
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Main Course';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Vegetarian';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'International';
UPDATE food_menu SET category = 'Lunch' WHERE category = 'Appetizer';

-- 5. Fix food_menu category ENUM to match spec exactly
ALTER TABLE food_menu MODIFY COLUMN category ENUM('Breakfast','Lunch','Dinner','Beverage','Dessert','Fast Food','Traditional Food') NOT NULL;

-- 6. Fix food_orders delivery_type column
ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS delivery_type ENUM('delivery','pickup') DEFAULT 'pickup';

-- 7. Create discounts table (idempotent)
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

-- 8. Create delete_approval_requests table (idempotent)
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

-- 9. Create customer_reports table for customer->manager reports
CREATE TABLE IF NOT EXISTS customer_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    user_id INT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending','reviewed','resolved') DEFAULT 'pending',
    manager_response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. Migrate booked rooms to reserved
UPDATE rooms SET status = 'reserved' WHERE status = 'booked';

-- 11. Make salary nullable in employees
ALTER TABLE employees MODIFY COLUMN salary DECIMAL(10,2) DEFAULT NULL;

-- 12. Add first_name, last_name to comments for proper attribution
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS type ENUM('feedback','report') DEFAULT 'feedback';

SELECT 'Migration v3 complete!' as result;
