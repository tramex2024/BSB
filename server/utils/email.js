/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA BREVO SMTP (PORT 2525 - RENDER COMPATIBLE)
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 2525,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendMail(to, subject, htmlContent) {
    try {
        console.log(`[EMAIL-SERVICE] Attempting to send via Brevo SMTP to: ${to}`);
        
        const info = await transporter.sendMail({
            from: `"Nexus Labs Support" <info.nexuslabs@gmail.com>`,
            to: to,
            subject: subject,
            html: htmlContent
        });

        console.log(`[EMAIL-SERVICE] SUCCESS: Email sent. ID: ${info.messageId}`);
        return { messageId: info.messageId };
    } catch (error) {
        console.error("❌ [EMAIL-SERVICE ACTUAL ERROR]:", error.message);
        throw error;
    }
}

async function sendTokenEmail(email, token) {
    console.log(`[EMAIL-SERVICE] 📨 Sending access code to: ${email}...`);
    
    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; color: #1f2937;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0;">BSB Verification</h2>
            </div>
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #111827;">${token}</span>
            </div>
            <p style="font-size: 14px; line-height: 1.5;">This code is valid for 10 minutes.</p>
        </div>`;

    const info = await sendMail(email, "🔑 Your BSB Access Code", html);
    return { success: true, messageId: info.messageId };
}

async function sendSupportTicketEmail(ticketData) {
    const { email, category, message, ticketId } = ticketData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Ticket: ${ticketId}</h2><p><b>From:</b> ${email}</p><p>${message}</p></div>`;
    return await sendMail('info.nexuslabs@gmail.com', `[${category.toUpperCase()}] Ticket: ${ticketId}`, html);
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, amount, hash, type } = paymentData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Payment</h2><p>User: ${email}</p><p>Amount: ${amount} USDT</p><p>TXID: ${hash}</p></div>`;
    return await sendMail('info.nexuslabs@gmail.com', `💰 [PAYMENT: ${type}] from ${email}`, html);
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };