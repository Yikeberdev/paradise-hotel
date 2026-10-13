const db = require('../config/db');
const crypto = require('crypto');
const { encryptField, decryptField, encryptBalance, decryptBalance } = require('../utils/cryptoFields');

function accountNumberHash(accountNumber) {
    return crypto.createHash('sha256').update(String(accountNumber || '').trim()).digest('hex');
}

async function ensureColumns() {
    try {
        await db.execute('ALTER TABLE bank_accounts ADD COLUMN account_number_hash VARCHAR(64) NULL');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE bank_accounts ADD UNIQUE INDEX uq_account_number_hash (account_number_hash)');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE bank_accounts MODIFY COLUMN balance VARCHAR(255) NOT NULL DEFAULT "0"');
    } catch (_) {}
    try {
        await db.execute('ALTER TABLE bank_accounts MODIFY COLUMN account_number VARCHAR(512) NULL');
    } catch (_) {}
}

let columnsReady = false;
async function ready() {
    if (!columnsReady) {
        await ensureColumns();
        columnsReady = true;
    }
}

function mapRow(row) {
    if (!row) return null;
    const out = { ...row };
    if (out.account_number != null) {
        out.account_number = decryptField(out.account_number);
    }
    if (out.balance != null) {
        const asNum = Number(out.balance);
        if (Number.isFinite(asNum) && String(out.balance).length < 24) {
            out.balance = asNum;
        } else {
            out.balance = decryptBalance(out.balance);
        }
        out.balance = Number(out.balance) || 0;
    }
    return out;
}

class BankAccount {
    static async create(data) {
        await ready();
        const {
            ownerType, customerId, bankName, bankCode, accountNumber,
            accountUsername, accountHolderName, balance = 0, isPrimary = 0
        } = data;

        const plainAcc = String(accountNumber || '').trim();
        if (!plainAcc) throw new Error('Account number is required');
        const hash = accountNumberHash(plainAcc);

        const [dup] = await db.execute(
            'SELECT id FROM bank_accounts WHERE account_number_hash = ? LIMIT 1',
            [hash]
        );
        if (dup.length) {
            throw new Error('Account number must be unique');
        }

        const encAcc = encryptField(plainAcc);
        const encBal = encryptBalance(balance);

        const [result] = await db.execute(
            `INSERT INTO bank_accounts
            (owner_type, customer_id, bank_name, bank_code, account_number, account_number_hash,
             account_username, account_holder_name, balance, is_primary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ownerType, customerId || null, bankName, bankCode || null, encAcc, hash,
                accountUsername, accountHolderName, encBal, isPrimary ? 1 : 0
            ]
        );
        return result.insertId;
    }

    static async findById(id) {
        await ready();
        const [rows] = await db.execute('SELECT * FROM bank_accounts WHERE id = ?', [id]);
        return mapRow(rows[0]);
    }

    static async findHotelAccounts() {
        await ready();
        const [rows] = await db.execute(
            `SELECT id, bank_name, bank_code, account_number, account_username,
                    account_holder_name, currency, is_primary, balance
             FROM bank_accounts
             WHERE owner_type = 'hotel' AND is_active = 1
             ORDER BY is_primary DESC, bank_name`
        );
        return rows.map(mapRow);
    }

    static async findByCustomerId(customerId) {
        await ready();
        const [rows] = await db.execute(
            `SELECT * FROM bank_accounts
             WHERE owner_type = 'customer' AND customer_id = ? AND is_active = 1
             ORDER BY is_primary DESC`,
            [customerId]
        );
        return rows.map(mapRow);
    }

    static async findCustomerAccountByCredentials(fullName, accountUsername) {
        await ready();
        const [rows] = await db.execute(
            `SELECT * FROM bank_accounts
             WHERE owner_type = 'customer'
               AND is_active = 1
               AND LOWER(TRIM(account_username)) = LOWER(TRIM(?))
               AND LOWER(TRIM(account_holder_name)) = LOWER(TRIM(?))
             LIMIT 1`,
            [accountUsername, fullName]
        );
        return mapRow(rows[0]);
    }

    static async findByAccountNumber(accountNumber) {
        await ready();
        const hash = accountNumberHash(accountNumber);
        const [rows] = await db.execute(
            'SELECT * FROM bank_accounts WHERE account_number_hash = ? LIMIT 1',
            [hash]
        );
        return mapRow(rows[0]);
    }

    static async getBalance(accountId) {
        const row = await BankAccount.findById(accountId);
        if (!row) return null;
        return {
            balance: row.balance,
            currency: row.currency,
            account_holder_name: row.account_holder_name,
            account_username: row.account_username,
            bank_name: row.bank_name,
        };
    }

    static async transfer(opts) {
        await ready();
        const {
            fromAccountId, toAccountId, amount, transactionType,
            referenceType, referenceId, description, initiatedBy
        } = opts;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [fromRows] = await conn.execute(
                'SELECT * FROM bank_accounts WHERE id = ? FOR UPDATE',
                [fromAccountId]
            );
            const [toRows] = await conn.execute(
                'SELECT * FROM bank_accounts WHERE id = ? FOR UPDATE',
                [toAccountId]
            );
            if (!fromRows.length || !toRows.length) throw new Error('Account not found');
            const from = mapRow(fromRows[0]);
            const to = mapRow(toRows[0]);
            const amt = Number(amount);
            if (amt <= 0) throw new Error('Amount must be positive');
            if (Number(from.balance) < amt) throw new Error('Insufficient balance');
            const newFrom = Number(from.balance) - amt;
            const newTo = Number(to.balance) + amt;
            await conn.execute(
                'UPDATE bank_accounts SET balance = ? WHERE id = ?',
                [encryptBalance(newFrom), fromAccountId]
            );
            await conn.execute(
                'UPDATE bank_accounts SET balance = ? WHERE id = ?',
                [encryptBalance(newTo), toAccountId]
            );
            const [tx] = await conn.execute(
                `INSERT INTO account_transactions
                (from_account_id, to_account_id, amount, transaction_type, reference_type, reference_id, description, status, initiated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
                [
                    fromAccountId, toAccountId, amt, transactionType,
                    referenceType || null, referenceId || null, description || null, initiatedBy || null
                ]
            );
            await conn.commit();
            return { transactionId: tx.insertId, amount: amt };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async updateBalance(id, balance) {
        await ready();
        await db.execute('UPDATE bank_accounts SET balance = ? WHERE id = ?', [encryptBalance(balance), id]);
    }

    static async listAll() {
        await ready();
        const [rows] = await db.execute(
            `SELECT ba.*, c.first_name, c.last_name, c.email
             FROM bank_accounts ba
             LEFT JOIN customers c ON ba.customer_id = c.id
             ORDER BY ba.owner_type, ba.bank_name`
        );
        return rows.map(mapRow);
    }
}

module.exports = BankAccount;
