/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA RESEND API (HTTPS / NO-EXPIRATION)
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL; // || 'onboarding@resend.dev'; // O tu dominio verificado

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

    try {
        const data = await resend.emails.send({
            from: `BSB Bot <${SENDER_EMAIL}>`,
            to: [email],
            subject: '🔑 Your BSB Access Code',
            html: html
        });

        console.log(`[EMAIL-SERVICE] ✅ Email sent. ID: ${data.id}`);
        return { success: true, messageId: data.id };
    } catch (error) {
        console.error("❌ [EMAIL-SERVICE ACTUAL ERROR]:", error.message);
        throw error;
    }
}

async function sendSupportTicketEmail(ticketData) {
    const { email, category, message, ticketId } = ticketData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Ticket: ${ticketId}</h2><p><b>From:</b> ${email}</p><p>${message}</p></div>`;
    
    await resend.emails.send({
        from: `BSB Support <${SENDER_EMAIL}>`,
        to: [process.env.GMAIL_USER || 'info.nexuslabs@gmail.com'],
        subject: `[${category.toUpperCase()}] Ticket: ${ticketId}`,
        html: html
    });
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, amount, hash, type } = paymentData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Payment</h2><p>User: ${email}</p><p>Amount: ${amount} USDT</p><p>TXID: ${hash}</p></div>`;
    
    await resend.emails.send({
        from: `BSB Payments <${SENDER_EMAIL}>`,
        to: [process.env.GMAIL_USER || 'info.nexuslabs@gmail.com'],
        subject: `💰 [PAYMENT: ${type}] from ${email}`,
        html: html
    });
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };