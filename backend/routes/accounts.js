const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/db');
const BankAccount = require('../models/BankAccount');

// Hotel accounts for payment method selection (read-only for customers)
router.get('/hotel', auth, async (req, res) => {
    try {
        const accounts = await BankAccount.findHotelAccounts();
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Customer's own accounts
router.get('/my', auth, async (req, res) => {
    try {
        const [cust] = await db.execute('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        if (!cust.length) return res.json({ success: true, accounts: [] });
        const accounts = await BankAccount.findByCustomerId(cust[0].id);
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Query balance: match full name + account username
router.post('/query-balance', auth, async (req, res) => {
    try {
        const { fullName, accountUsername } = req.body;
        if (!fullName || !accountUsername) {
            return res.status(400).json({ success: false, message: 'Full name and account username are required' });
        }

        // Prefer matching against logged-in customer's registration name
        const [users] = await db.execute(
            'SELECT first_name, last_name, username FROM users WHERE id = ?',
            [req.user.id]
        );
        const [cust] = await db.execute(
            'SELECT id, first_name, last_name FROM customers WHERE user_id = ?',
            [req.user.id]
        );

        const regFullName = cust.length
            ? `${cust[0].first_name} ${cust[0].last_name}`.trim()
            : users.length
                ? `${users[0].first_name || ''} ${users[0].last_name || ''}`.trim()
                : '';

        if (regFullName && regFullName.toLowerCase() !== String(fullName).trim().toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: 'Full name must match your registration name: ' + regFullName
            });
        }

        const account = await BankAccount.findCustomerAccountByCredentials(fullName, accountUsername);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'No active account found for this full name and account username'
            });
        }

        // Ensure account belongs to this customer when linked
        if (cust.length && account.customer_id && account.customer_id !== cust[0].id) {
            return res.status(403).json({ success: false, message: 'This account does not belong to you' });
        }

        res.json({
            success: true,
            balance: Number(account.balance),
            currency: account.currency || 'ETB',
            bank_name: account.bank_name,
            account_username: account.account_username,
            account_holder_name: account.account_holder_name,
            account_id: account.id
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Register / link a customer bank account
// Same account number + username for this customer → add to existing balance (update)
router.post('/my', auth, async (req, res) => {
    try {
        const { bankName, bankCode, accountNumber, accountUsername, accountHolderName, initialBalance } = req.body;
        if (!bankName || !accountNumber || !accountUsername) {
            return res.status(400).json({ success: false, message: 'Bank name, account number and account username are required' });
        }

        let [cust] = await db.execute('SELECT id, first_name, last_name FROM customers WHERE user_id = ?', [req.user.id]);
        if (!cust.length) {
            // create customer row from user if missing
            const [u] = await db.execute('SELECT first_name, last_name, email, phone FROM users WHERE id = ?', [req.user.id]);
            if (!u.length) return res.status(400).json({ success: false, message: 'User not found' });
            const [ins] = await db.execute(
                `INSERT INTO customers (user_id, first_name, last_name, email, phone) VALUES (?,?,?,?,?)`,
                [req.user.id, u[0].first_name, u[0].last_name, u[0].email, u[0].phone || '']
            );
            cust = [{ id: ins.insertId, first_name: u[0].first_name, last_name: u[0].last_name }];
        }

        const regName = `${cust[0].first_name || ''} ${cust[0].last_name || ''}`.trim();
        if (!regName) {
            return res.status(400).json({ success: false, message: 'Account name (registration full name) is required' });
        }
        if (accountHolderName && String(accountHolderName).trim().toLowerCase() !== regName.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: 'Account name must match your registration name: ' + regName
            });
        }
        const addBalance = Number(initialBalance) || 0;
        const accNo = String(accountNumber).trim();
        const accUser = String(accountUsername).trim();

        // Existing account: unique account number (hash) + username → add encrypted balance
        const existingAcc = await BankAccount.findByAccountNumber(accNo);
        if (existingAcc) {
            if (existingAcc.owner_type === 'customer' && existingAcc.customer_id &&
                Number(existingAcc.customer_id) !== Number(cust[0].id)) {
                return res.status(400).json({
                    success: false,
                    message: 'This account number is already linked to another customer'
                });
            }
            if (String(existingAcc.account_username || '').toLowerCase() !== accUser.toLowerCase() &&
                existingAcc.owner_type === 'customer' && existingAcc.customer_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Account number already exists with a different account username'
                });
            }
            const newBal = Number(existingAcc.balance || 0) + addBalance;
            await BankAccount.updateBalance(existingAcc.id, newBal);
            await db.execute(
                `UPDATE bank_accounts SET customer_id = ?, account_holder_name = ?,
                 bank_name = COALESCE(?, bank_name), bank_code = COALESCE(?, bank_code), is_active = 1
                 WHERE id = ?`,
                [cust[0].id, regName, bankName || null, bankCode || null, existingAcc.id]
            );
            return res.json({
                success: true,
                message: 'Account updated — balance increased',
                accountId: existingAcc.id,
                balance: newBal,
                updated: true
            });
        }

        // New account (account number encrypted + unique)
        try {
            const id = await BankAccount.create({
                ownerType: 'customer',
                customerId: cust[0].id,
                bankName,
                bankCode: bankCode || '',
                accountNumber: accNo,
                accountUsername: accUser,
                accountHolderName: regName,
                balance: addBalance,
                isPrimary: 1
            });
            res.status(201).json({
                success: true,
                message: 'Account linked',
                accountId: id,
                balance: addBalance,
                updated: false
            });
        } catch (e) {
            return res.status(400).json({ success: false, message: e.message || 'Could not link account' });
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Account number or username already exists. Use the same number and username together to top up balance.'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin/Manager: list all accounts
router.get('/', auth, authorize('admin', 'manager'), async (req, res) => {
    try {
        const accounts = await BankAccount.listAll();
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: manage hotel accounts
router.post('/hotel', auth, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { bankName, bankCode, accountNumber, accountUsername, accountHolderName, balance, isPrimary } = req.body;
        const id = await BankAccount.create({
            ownerType: 'hotel',
            customerId: null,
            bankName,
            bankCode,
            accountNumber,
            accountUsername,
            accountHolderName: accountHolderName || 'Paradise Hotel',
            balance: Number(balance) || 0,
            isPrimary: !!isPrimary
        });
        res.status(201).json({ success: true, accountId: id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
