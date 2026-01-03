// src/server/utils/email.js

// src/server/utils/email.js
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTokenEmail(email, token) {
    // CAMBIO CLAVE: Resend en modo prueba solo permite enviar al correo de la cuenta
    const target = 'info.nexuslabs@gmail.com'; 

    console.log("--- 🏁 Intento PASO 1.6 (Destinatario Autorizado) ---");
    console.log("- Enviando a cuenta propia:", target);

    try {
        const { data, error } = await resend.emails.send({
            from: 'BSB Bot <onboarding@resend.dev>',
            to: target,
            subject: '🚀 Tu Token de BSB - PRUEBA FINAL',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 2px solid #3b82f6; border-radius: 10px;">
                    <h2 style="color: #3b82f6;">¡CONEXIÓN EXITOSA!</h2>
                    <p style="font-size: 18px;">Tu token de acceso es: <strong>${token}</strong></p>
                    <p style="color: #888; font-size: 12px;">Enviado exitosamente desde Render vía Resend API.</p>
                </div>
            `
        });

        if (error) {
            throw new Error(error.message);
        }

        console.log("✅ ¡ÉXITO TOTAL! Revisa info.nexuslabs@gmail.com. ID:", data.id);
        return data;

    } catch (error) {
        console.error("❌ Error en la API de Resend:", error.message);
        throw error;
    }
}

module.exports = { sendTokenEmail };