/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA GMAIL API (HTTPS / NO-SMTP)
 */

const { google } = require('googleapis');

// --- DEBUGGING CRÍTICO ---
console.log("🔍 [DEBUG-EMAIL] Verificando credenciales de Gmail API...");
console.log("🔍 GMAIL_USER:", process.env.GMAIL_USER ? "Cargado" : "NO ENCONTRADO");
console.log("🔍 GMAIL_CLIENT_ID:", process.env.GMAIL_CLIENT_ID ? "Cargado" : "NO ENCONTRADO");
// -------------------------

// Configuración del cliente OAuth2 de Google
const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // Debe coincidir con la redirección configurada
);

oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

/**
 * Helper para codificar el correo en el formato Base64 seguro que exige la API de Google (RFC 2822)
 */
function encodeEmail(to, from, subject, htmlContent) {
    const str = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        htmlContent
    ].join('\n');

    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Función genérica de envío a través de HTTPS POST
 */
async function sendMail(to, subject, htmlContent) {
    try {
        console.log(`[EMAIL-SERVICE] Intentando enviar vía GMAIL API a: ${to}`);
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const rawMessage = encodeEmail(to, `"Nexus Labs Support" <${process.env.GMAIL_USER}>`, subject, htmlContent);
        
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawMessage
            }
        });

        console.log(`[EMAIL-SERVICE] ÉXITO: Correo enviado. ID: ${response.data.id}`);
        return { messageId: response.data.id };
    } catch (error) {
        console.error("❌ [EMAIL-SERVICE ERROR REAL VIA API]:", error.message);
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
    
    return await sendMail(process.env.GMAIL_USER, `[${category.toUpperCase()}] Ticket: ${ticketId}`, html);
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, amount, hash, type } = paymentData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Payment</h2><p>User: ${email}</p><p>Amount: ${amount} USDT</p><p>TXID: ${hash}</p></div>`;
    
    return await sendMail(process.env.GMAIL_USER, `💰 [PAYMENT: ${type}] from ${email}`, html);
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };