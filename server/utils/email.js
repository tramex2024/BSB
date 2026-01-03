// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

async function sendTokenEmail(ignoredEmail, token) {
    // Variables fijas para la prueba (Ignoramos el email que viene del front)
    const EMAIL_USER = 'info.nexuslabs@gmail.com';
    const EMAIL_PASS = 'lukedknjgjvbfeaq';
    const EMAIL_TARGET = 'tramex2024@gmail.com'; // Destinatario implícito

    console.log("--- 🚀 Iniciando intento de envío directo (PASO 1.1) ---");
    console.log("Destinatario fijo:", EMAIL_TARGET);
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,         // Cambiamos a 587 para saltar el bloqueo de Render
        secure: false,      // Debe ser false para el puerto 587
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        },
        // Forzamos un tiempo de espera corto para que no se quede congelado
        connectionTimeout: 10000, 
        greetingTimeout: 10000
    });

    const mailOptions = {
        from: EMAIL_USER,
        to: EMAIL_TARGET, 
        subject: '🚀 PRUEBA AISLADA - BSB',
        text: `Esta es una prueba con destinatario fijo. Token: ${token}`
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };