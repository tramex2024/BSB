// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

async function sendTokenEmail(email, token) {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const target = 'tramex2024@gmail.com'; 

    console.log("--- 🏁 Intento PASO 1.4 (Modo Service) ---");

    // Usamos la configuración de 'service' que es un atajo interno de Nodemailer
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: user,
            pass: pass
        },
        // Eliminamos verify() para ir directo al envío
    });

    const mailOptions = {
        from: user, 
        to: target, 
        subject: '🚀 PRUEBA FINAL - BSB',
        text: `Token: ${token}. Enviado por modo Service.`
    };

    console.log("Intentando envío directo sin verificación previa...");
    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };