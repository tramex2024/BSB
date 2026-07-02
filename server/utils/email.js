/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA GMAIL (NODEMAILER)
 */

const nodemailer = require('nodemailer');

// --- DEBUGGING CRÍTICO ---
console.log("🔍 [DEBUG-EMAIL] Verificando variables de entorno...");
console.log("🔍 EMAIL_USER:", process.env.EMAIL_USER ? "Cargado" : "NO ENCONTRADO");
// Solo mostramos la longitud para no exponer la clave en los logs
console.log("🔍 EMAIL_PASS Longitud:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : "NO ENCONTRADO");
// -------------------------

// Configuración del transportador SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true para puerto 465     
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Función genérica de envío (privada)
 */
async function sendMail(to, subject, htmlContent) {
    const mailOptions = {
        from: `"Nexus Labs Support" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent
    };

    try {
        console.log(`[EMAIL-SERVICE] Intentando enviar a: ${to}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL-SERVICE] ÉXITO: ${info.messageId}`);
        return info;
    } catch (error) {
        // ESTO ES LO QUE NOS DIRÁ EL ERROR REAL
        console.error("❌ [EMAIL-SERVICE ERROR REAL]:", error); 
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
            <p style="font-size: 14px; line-height: 1.5;">Este código es válido por 10 minutos.</p>
        </div>`;

    const info = await sendMail(email, "🔑 Your BSB Access Code", html);
    console.log(`[EMAIL-SERVICE] ✅ Email sent. ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
}

async function sendSupportTicketEmail(ticketData) {
    const { email, category, message, ticketId } = ticketData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Ticket: ${ticketId}</h2><p><b>From:</b> ${email}</p><p>${message}</p></div>`;
    
    return await sendMail(process.env.EMAIL_USER, `[${category.toUpperCase()}] Ticket: ${ticketId}`, html);
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, amount, hash, type } = paymentData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Payment</h2><p>User: ${email}</p><p>Amount: ${amount} USDT</p><p>TXID: ${hash}</p></div>`;
    
    return await sendMail(process.env.EMAIL_USER, `💰 [PAYMENT: ${type}] from ${email}`, html);
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };