// src/server/utils/email.js

const { Resend } = require('resend');

// La librería buscará automáticamente la API Key en process.env.RESEND_API_KEY
// o puedes pasarla directamente si prefieres, pero lo ideal es el panel de Render.
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTokenEmail(email, token) {
    const target = 'tramex2024@gmail.com'; 

    console.log("--- 🏁 Intento PASO 1.5 (Librería Resend Oficial) ---");
    console.log("- Destinatario fijo:", target);

    try {
        const { data, error } = await resend.emails.send({
            from: 'BSB Bot <onboarding@resend.dev>',
            to: target,
            subject: '🚀 Tu Token de BSB',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>Código de Verificación</h2>
                    <p style="font-size: 18px;">Tu token es: <strong>${token}</strong></p>
                    <p style="color: #888; font-size: 12px;">Enviado vía API HTTP (Resend Library)</p>
                </div>
            `
        });

        if (error) {
            throw new Error(error.message);
        }

        console.log("✅ ¡ÉXITO TOTAL! Correo enviado. ID:", data.id);
        return data;

    } catch (error) {
        console.error("❌ Error en la API de Resend:", error.message);
        throw error;
    }
}

module.exports = { sendTokenEmail };