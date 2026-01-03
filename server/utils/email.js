// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

async function sendTokenEmail(email, token) {
    // Variables fijas para la prueba simplificada
    const EMAIL_USER = 'info.nexuslabs@gmail.com';
    const EMAIL_PASS = 'lukedknjgjvbfeaq';

    console.log("--- 🚀 Iniciando intento de envío directo ---");
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    const mailOptions = {
        from: EMAIL_USER,
        to: email, // El email que llega desde el login
        subject: '🚀 BSB - Token de Acceso Directo',
        text: `Tu token de seguridad es: ${token}\nEnviado desde el sistema de utilidades.`
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };