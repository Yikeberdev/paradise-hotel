const db = require('../config/db');

class FoodOrder {
    static async create(orderData) {
        const { 
            customerId, orderType, referenceId, totalAmount, 
            paymentReference, specialInstructions, deliveryAddress 
        } = orderData;
        
        const [result] = await db.execute(
            `INSERT INTO food_orders 
            (customer_id, order_type, reference_id, total_amount, 
             status, payment_status, payment_reference, special_instructions, delivery_address) 
            VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?, ?)`,
            [
                customerId, orderType, referenceId || null, totalAmount,
                paymentReference || null, specialInstructions || '', deliveryAddress || ''
            ]
        );
        return result.insertId;
    }

    static async addItem(orderItemData) {
        const { orderId, menuId, quantity, subtotal, specialInstructions } = orderItemData;
        const [result] = await db.execute(
            `INSERT INTO food_order_items 
            (order_id, menu_id, quantity, subtotal, special_instructions) 
            VALUES (?, ?, ?, ?, ?)`,
            [orderId, menuId, quantity, subtotal, specialInstructions || '']
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            `SELECT o.*, u.first_name, u.last_name, u.email, u.phone 
            FROM food_orders o 
            LEFT JOIN users u ON o.customer_id = u.id 
            WHERE o.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async getItems(orderId) {
        const [rows] = await db.execute(
            `SELECT oi.*, f.item_name, f.price, f.image 
            FROM food_order_items oi 
            LEFT JOIN food_menu f ON oi.menu_id = f.id 
            WHERE oi.order_id = ?`,
            [orderId]
        );
        return rows;
    }

    static async findByCustomerId(customerId) {
        const [rows] = await db.execute(
            `SELECT o.*, 
                    (SELECT COUNT(*) FROM food_order_items WHERE order_id = o.id) as item_count 
            FROM food_orders o 
            WHERE o.customer_id = ? 
            ORDER BY o.order_date DESC`,
            [customerId]
        );
        return rows;
    }

    static async update(id, data) {
        const { status, paymentStatus, paymentReference, specialInstructions, isRead } = data;
        await db.execute(
            `UPDATE food_orders SET 
            status = ?, payment_status = ?, payment_reference = ?, 
            special_instructions = ?, is_read = ? 
            WHERE id = ?`,
            [status, paymentStatus, paymentReference, specialInstructions, isRead, id]
        );
    }

    static async updateStatus(id, status) {
        await db.execute('UPDATE food_orders SET status = ? WHERE id = ?', [status, id]);
    }

    static async updatePaymentStatus(id, paymentStatus) {
        await db.execute('UPDATE food_orders SET payment_status = ? WHERE id = ?', [paymentStatus, id]);
    }

    static async delete(id) {
        await db.execute('DELETE FROM food_orders WHERE id = ?', [id]);
    }

    static async deleteItems(orderId) {
        await db.execute('DELETE FROM food_order_items WHERE order_id = ?', [orderId]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT o.*, u.first_name, u.last_name 
            FROM food_orders o 
            LEFT JOIN users u ON o.customer_id = u.id 
            ORDER BY o.order_date DESC`
        );
        return rows;
    }

    static async getPending() {
        const [rows] = await db.execute(
            `SELECT o.*, u.first_name, u.last_name 
            FROM food_orders o 
            LEFT JOIN users u ON o.customer_id = u.id 
            WHERE o.status = 'pending' AND o.is_read = 0 
            ORDER BY o.order_date DESC`
        );
        return rows;
    }

    static async getByStatus(status) {
        const [rows] = await db.execute(
            `SELECT o.*, u.first_name, u.last_name 
            FROM food_orders o 
            LEFT JOIN users u ON o.customer_id = u.id 
            WHERE o.status = ? 
            ORDER BY o.order_date DESC`,
            [status]
        );
        return rows;
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM food_orders');
        return rows[0].total;
    }

    static async countByStatus() {
        const [rows] = await db.execute(
            'SELECT status, COUNT(*) as count FROM food_orders GROUP BY status'
        );
        return rows;
    }
}

module.exports = FoodOrder;