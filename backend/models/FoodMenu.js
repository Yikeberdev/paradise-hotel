const db = require('../config/db');

class FoodMenu {
    static async create(menuData) {
        const { 
            itemName, category, description, price, availability, 
            isSpecial, ingredients, preparationTime, image 
        } = menuData;
        
        const [result] = await db.execute(
            `INSERT INTO food_menu 
            (item_name, category, description, price, availability, 
             is_special, ingredients, preparation_time, image) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                itemName,
                category,
                description || '',
                price,
                availability || 'available',
                isSpecial || 0,
                ingredients || '',
                preparationTime || 15,
                image || 'food-default.jpg'
            ]
        );
        return result.insertId;
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM food_menu WHERE id = ?', [id]);
        return rows[0];
    }

    static async findByCategory(category) {
        const [rows] = await db.execute(
            'SELECT * FROM food_menu WHERE category = ? AND availability = "available" ORDER BY item_name',
            [category]
        );
        return rows;
    }

    static async update(id, data) {
        const { 
            itemName, category, description, price, availability, 
            isSpecial, ingredients, preparationTime, image 
        } = data;
        
        await db.execute(
            `UPDATE food_menu SET 
            item_name = ?, category = ?, description = ?, price = ?, 
            availability = ?, is_special = ?, ingredients = ?, preparation_time = ?, image = ? 
            WHERE id = ?`,
            [
                itemName, category, description, price,
                availability, isSpecial, ingredients, preparationTime, image, id
            ]
        );
    }

    static async updateAvailability(id, availability) {
        await db.execute(
            'UPDATE food_menu SET availability = ? WHERE id = ?',
            [availability, id]
        );
    }

    static async delete(id) {
        await db.execute('DELETE FROM food_menu WHERE id = ?', [id]);
    }

    static async getAll() {
        const [rows] = await db.execute(
            'SELECT * FROM food_menu ORDER BY category, item_name'
        );
        return rows;
    }

    static async getAvailable() {
        const [rows] = await db.execute(
            'SELECT * FROM food_menu WHERE availability = "available" ORDER BY category, item_name'
        );
        return rows;
    }

    static async getSpecialItems() {
        const [rows] = await db.execute(
            'SELECT * FROM food_menu WHERE is_special = 1 AND availability = "available" ORDER BY category, item_name'
        );
        return rows;
    }

    static async getCategories() {
        const [rows] = await db.execute(
            'SELECT DISTINCT category FROM food_menu ORDER BY category'
        );
        return rows.map(row => row.category);
    }

    static async count() {
        const [rows] = await db.execute('SELECT COUNT(*) as total FROM food_menu');
        return rows[0].total;
    }

    static async countByCategory() {
        const [rows] = await db.execute(
            'SELECT category, COUNT(*) as count FROM food_menu GROUP BY category'
        );
        return rows;
    }
}

module.exports = FoodMenu;