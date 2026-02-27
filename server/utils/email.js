/**
 * BSB/server/utils/email.js
 * EMAIL DELIVERY SERVICE VIA BREVO API (HTTP) - LANGUAGE: ENGLISH
 */

async function sendTokenEmail(email, token) {
    const API_KEY = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || "info.nexuslabs@gmail.com"; 

    if (!API_KEY) {
        console.error("❌ ERROR: BREVO_API_KEY is not defined in .env");
        throw new Error("Email service configuration missing.");
    }

    try {
        console.log(`[EMAIL-SERVICE] 📨 Sending access code to: ${email}...`);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "Nexus Labs Support", email: senderEmail },
                to: [{ email: email.toLowerCase().trim() }],
                subject: "🔑 Your BSB Access Code",
                htmlContent: `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; color: #1f2937;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="color: #2563eb; margin: 0;">BSB Verification</h2>
                            <p style="font-size: 14px; color: #6b7280;">Use the following code to sign in to your account</p>
                        </div>
                        
                        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
                            <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #111827;">
                                ${token}
                            </span>
                        </div>
                        
                        <p style="font-size: 14px; line-height: 1.5;">
                            This code is valid for the next <b>10 minutes</b>. If you did not request this access, you can safely ignore this email.
                        </p>
                        
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0;">
                        
                        <div style="text-align: center;">
                            <p style="font-size: 11px; color: #9ca3af; margin: 0;">
                                Nexus Labs &copy; 2026 | Algorithmic Trading Technology
                            </p>
                            <p style="font-size: 10px; color: #d1d5db; margin-top: 5px;">
                                For security reasons, never share this code with anyone.
                            </p>
                        </div>
                    </div>`
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `HTTP Error ${response.status}`);
        }

        console.log(`[EMAIL-SERVICE] ✅ Email sent successfully. ID: ${data.messageId}`);
        return { success: true, messageId: data.messageId };

    } catch (error) {
        console.error("❌ [EMAIL-SERVICE ERROR]:", error.message);
        throw error;
    }
}

/**
 * Envía el ticket de soporte al administrador usando la API de Brevo
 */
async function sendSupportTicketEmail(ticketData) {
    const API_KEY = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || "info.nexuslabs@gmail.com"; 
    const adminEmail = "info.nexuslabs@gmail.com"; // <-- Pon aquí donde quieres recibir los tickets

    if (!API_KEY) throw new Error("Brevo API Key missing");

    const { userId, email, category, message, ticketId } = ticketData;

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "BSB Support System", email: senderEmail },
                to: [{ email: adminEmail }], 
                subject: `[${category.toUpperCase()}] Ticket: ${ticketId}`,
                htmlContent: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; color: #374151;">
                        <h2 style="color: #2563eb; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">New Support Ticket</h2>
                        <div style="margin: 20px 0; background: #f9fafb; padding: 15px; border-radius: 8px;">
                            <p><strong>Ticket ID:</strong> <span style="font-family: monospace;">${ticketId}</span></p>
                            <p><strong>Category:</strong> ${category}</p>
                            <p><strong>From:</strong> ${email}</p>
                            <p><strong>User ID:</strong> ${userId}</p>
                        </div>
                        <div style="padding: 15px; border-left: 4px solid #2563eb; background: #ffffff;">
                            <p style="font-weight: bold; margin-bottom: 5px;">User Message:</p>
                            <p style="line-height: 1.6;">${message}</p>
                        </div>
                        <p style="font-size: 11px; color: #9ca3af; margin-top: 30px; text-align: center;">
                            Nexus Labs Support System &copy; 2026
                        </p>
                    </div>`
            })
        });

        return await response.json();
    } catch (error) {
        console.error("❌ [BREVO-SUPPORT-ERROR]:", error.message);
        throw error;
    }
}

module.exports = { sendTokenEmail, sendSupportTicketEmail };