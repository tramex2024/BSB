// src/server/utils/email.js

async function sendTokenEmail(email, token) {
    const API_KEY = process.env.BREVO_API_KEY;
    const senderEmail = "info.nexuslabs@gmail.com"; 

    console.log("--- 🏁 Paso 5: Enviando vía BREVO API ---");
    console.log("- De:", senderEmail);
    console.log("- Para:", email);

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "Nexus Labs Support", email: senderEmail },
                to: [{ email: email }], // Aquí ya es el email dinámico del usuario
                subject: "🚀 Tu Token de Acceso BSB",
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                        <h2 style="color: #3b82f6;">Verificación de Acceso</h2>
                        <p>Tu código de seguridad para el bot es:</p>
                        <div style="background: #f3f4f6; padding: 15px; font-size: 24px; font-weight: bold; text-align: center;">
                            ${token}
                        </div>
                        <p style="font-size: 12px; color: #999; margin-top: 20px;">Enviado desde el motor de BSB vía HTTP API.</p>
                    </div>`
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Error Brevo: ${data.message || JSON.stringify(data)}`);
        }

        console.log("✅ ¡ÉXITO TOTAL CON BREVO! ID del mensaje:", data.messageId);
        return data;

    } catch (error) {
        console.error("❌ Falló el envío por API de Brevo:", error.message);
        throw error;
    }
}

module.exports = { sendTokenEmail };