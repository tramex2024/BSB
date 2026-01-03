// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

async function sendTokenEmail(ignoredEmail, token) {
    // Usamos las variables que YA ESTÁN en el panel de Render
    // Esto evita que GitGuardian las detecte y Google las bloquee
    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASS = process.env.EMAIL_PASS; 
    const EMAIL_TARGET = 'tramex2024@gmail.com'; 

    console.log("--- 🚀 Intento PASO 1.2 (Variables de Entorno) ---");
    console.log("Usando remitente:", EMAIL_USER);
    
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Usamos 'service' para que Google acepte la conexión más fácil
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    const mailOptions = {
        from: EMAIL_USER,
        to: EMAIL_TARGET, 
        subject: '🚀 PRUEBA AISLADA - PASO 1.2',
        text: `Esta prueba usa variables de Render. Token: ${token}`
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };