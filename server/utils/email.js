/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA RESEND API (ANTI-BLOCK/NO-SMTP)
 */

const { Resend } = require('resend');

// --- DEBUGGING CRÍTICO ---
console.log("🔍 [DEBUG-EMAIL] Verificando API de Resend...");
console.log("🔍 RESEND_API_KEY:", process.env.RESEND_API_KEY ? "Cargada correctamente" : "NO ENCONTRADA");
// -------------------------

// Inicializamos Resend con la API Key de las variables de entorno
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Función genérica de envío (privada utilizando la API de Resend)
 */
async function sendMail(to, subject, htmlContent) {
    try {
        console.log(`[EMAIL-SERVICE] Intentando enviar vía API a: ${to}`);
        
        // NOTA: Si usas la cuenta gratuita de Resend sin dominio propio verificado,
        // el remitente obligatoriamente debe ser: 'onboarding@resend.dev'
        // El destinatario solo podrá ser tu propio correo de registro para pruebas.
        const data = await resend.emails.send({
            from: 'BSB Verification <onboarding@resend.dev>', 
            to: to,
            subject: subject,
            html: htmlContent,
        });

        if (data.error) {
            throw new Error(data.error.message);
        }

        console.log(`[EMAIL-SERVICE] ÉXITO: Correo enviado. ID: ${data.data.id}`);
        return { messageId: data.data.id };
    } catch (error) {
        console.error("❌ [EMAIL-SERVICE ERROR REAL]:", error.message); 
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
    
    // Para alertas internas, te lo envías a ti mismo
    return await sendMail('tramex2024@gmail.com', `[${category.toUpperCase()}] Ticket: ${ticketId}`, html);
}

async function sendPaymentNotificationEmail(paymentData) {
    const { email, amount, hash, type } = paymentData;
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>New Payment</h2><p>User: ${email}</p><p>Amount: ${amount} USDT</p><p>TXID: ${hash}</p></div>`;
    
    return await sendMail('tramex2024@gmail.com', `💰 [PAYMENT: ${type}] from ${email}`, html);
}

module.exports = { sendTokenEmail, sendSupportTicketEmail, sendPaymentNotificationEmail };