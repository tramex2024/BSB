/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA GMAIL (NODEMAILER)
 */

const nodemailer = require('nodemailer');

// Configuración del transportador
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // IMPORTANTE: Generar en "Seguridad de Google"
    }
});

/**
 * Helper para enviar correos de manera unificada
 */
async function sendMail(to, subject, htmlContent) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error("Gmail configuration missing in .env");
    }

    try {
        const mailOptions = {
            from: `"Nexus Labs Support" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        return info;
    } catch (error) {
        console.error("❌ [GMAIL-ERROR]:", error.message);
        throw error;
    }
}

async function sendTokenEmail(email, token) {
    console.log(`[EMAIL-SERVICE] 📨 Sending access code to: ${email}...`);
    
    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; color: #1f2937;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0;">BSB Verification</h2>
                <p style="font-size: 14px; color: #6b7280;">Use the following code to sign in to your account</p>
            </div>
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #111827;">${token}</span>
            </div>
            <p style="font-size: 14px; line-height: 1.5;">This code is valid for the next <b>10 minutes</b>.</p>
        </div>`;

    const result = await sendMail(email.toLowerCase().trim(), "🔑 Your BSB Access Code", html);
    console.log(`[EMAIL-SERVICE] ✅ Email sent successfully. ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
}

async function sendSupportTicketEmail(ticketData) {
    const { email, category, message, ticketId } = ticketData;
    
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; color: #374151;">
            <h2 style="color: #2563eb;">New Support Ticket</h2>
            <p><strong>Ticket ID:</strong> ${ticketId}</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>From:</strong> ${email}</p>
            <p><strong>Message:</strong> ${message}</p>
        </div>`;

    return await sendMail(process.env.EMAIL_USER, `[${category.toUpperCase()}] Ticket: ${ticketId}`, html);
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, type, amount, hash, timestamp } = paymentData;
    
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 2px solid #10b981; border-radius: 15px;">
            <h2 style="color: #059669;">New Payment Submitted</h2>
            <p><strong>User:</strong> ${email}</p>
            <p><strong>Amount:</strong> ${amount} USDT</p>
            <p><strong>TXID:</strong> ${hash}</p>
        </div>`;

    return await sendMail(process.env.EMAIL_USER, `💰 [PAYMENT: ${type}] from ${email}`, html);
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };