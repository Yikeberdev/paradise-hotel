/**
 * Run from backend folder:
 *   node test-smtp.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function main() {
    console.log('SMTP_USER=', process.env.SMTP_USER || '(empty)');
    console.log('SMTP_PASS length=', String(process.env.SMTP_PASS || '').replace(/\s+/g, '').length);
    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (e) {
        console.error('Install nodemailer first: npm install nodemailer');
        process.exit(1);
    }
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
    if (!user || !pass) {
        console.error('Set SMTP_USER and SMTP_PASS in backend/.env');
        process.exit(1);
    }
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });
    try {
        await transporter.verify();
        console.log('SMTP verify: OK');
    } catch (e) {
        console.error('SMTP verify FAILED:', e.message);
        process.exit(1);
    }
    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || user,
        to: user,
        subject: 'Paradise Hotel SMTP test',
        text: 'If you received this, SMTP works. OTP emails will work too.',
    });
    console.log('Test email sent to', user, 'id=', info.messageId);
}
main().catch((e) => { console.error(e); process.exit(1); });
