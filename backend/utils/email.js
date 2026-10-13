/**
 * Email utility — OTP via Gmail App Password (nodemailer)
 */
const crypto = require('crypto');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { }

let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn('[email] nodemailer missing → npm install nodemailer');
}

function cleanPass(p) {
    return String(p || '').replace(/\s+/g, '').trim();
}

function smtpConfigured() {
    return !!(String(process.env.SMTP_USER || '').trim() && cleanPass(process.env.SMTP_PASS));
}

function getTransporter() {
    if (!nodemailer) return null;
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = cleanPass(process.env.SMTP_PASS);
    if (!user || !pass) return null;

    // Prefer explicit SMTP host (more reliable than service: 'gmail' on some networks)
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
    });
}

async function sendMail(toEmail, subject, textBody, htmlBody) {
    if (!toEmail) return { sent: false, mode: 'none', error: 'No recipient' };

    const user = String(process.env.SMTP_USER || '').trim();
    // Gmail is picky: From should match the authenticated user
    const from = user || process.env.SMTP_FROM || 'noreply@localhost';

    console.log('[email] To:', toEmail, '| Subject:', subject);
    console.log('[email] From:', from, '| configured:', smtpConfigured());

    const transporter = getTransporter();
    if (!transporter) {
        console.log('======== OTP (SMTP not ready — copy from console) ========');
        console.log(textBody);
        console.log('==========================================================');
        return {
            sent: false,
            mode: 'console',
            error: !nodemailer ? 'nodemailer not installed' : 'SMTP_USER/SMTP_PASS missing',
        };
    }

    try {
        await transporter.verify();
        console.log('[email] SMTP verify: OK');
    } catch (verErr) {
        console.error('[email] SMTP verify FAILED:', verErr.message);
        console.log('======== OTP (verify failed — use this code) ========');
        console.log(textBody);
        console.log('======================================================');
        return { sent: false, mode: 'smtp', error: verErr.message };
    }

    try {
        const info = await transporter.sendMail({
            from: `"Paradise Hotel" <${from}>`,
            to: toEmail,
            subject,
            text: textBody,
            html:
                htmlBody ||
                `<pre style="font-family:sans-serif;font-size:16px">${String(textBody).replace(/</g, '&lt;')}</pre>`,
        });
        console.log('[email] SENT OK messageId=', info.messageId);
        return { sent: true, mode: 'smtp', messageId: info.messageId };
    } catch (e) {
        console.error('[email] send FAILED:', e.message);
        console.log('======== OTP (send failed — use this code) ========');
        console.log(textBody);
        console.log('====================================================');
        return { sent: false, mode: 'smtp', error: e.message };
    }
}

async function sendNotificationEmail(toEmail, subject, bodyContent) {
    const r = await sendMail(toEmail, subject, String(bodyContent || ''));
    return r.sent || r.mode === 'console';
}

function generateFiveDigitOtp() {
    return String(crypto.randomInt(10000, 100000));
}

async function sendPasswordOtpEmail(toEmail, otp) {
    const subject = 'Paradise Hotel — Password reset code';
    const text =
        `Your Paradise Hotel password reset code is: ${otp}\n\n` +
        `Enter this 5-digit code on the login page.\n` +
        `Expires in 2 minutes.`;
    const html =
        `<div style="font-family:Arial,sans-serif;padding:24px">` +
        `<h2>Paradise Hotel</h2>` +
        `<p>Your password reset code:</p>` +
        `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#f0a500">${otp}</p>` +
        `<p style="color:#666">Expires in 2 minutes.</p></div>`;
    return sendMail(toEmail, subject, text, html);
}

module.exports = {
    sendNotificationEmail,
    sendMail,
    generateFiveDigitOtp,
    sendPasswordOtpEmail,
    smtpConfigured,
};
