// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

async function sendTokenEmail(email, token) {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const target = 'tramex2024@gmail.com'; 

    console.log("--- 🏁 Intento PASO 1.3 (Puerto 587) ---");

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,         // Puerto alternativo más compatible con Render
        secure: false,      // Debe ser false para el puerto 587 (usa STARTTLS)
        auth: {
            user: user,
            pass: pass
        },
        // Añadimos un límite de tiempo real para que no se quede congelado
        connectionTimeout: 10000, 
        greetingTimeout: 10000
    });

    const mailOptions = {
        from: `"Nexus Labs Test" <${user}>`, 
        to: target, 
        subject: '🚀 Prueba PASO 1.3 - BSB',
        text: `Si recibes esto en Render, el puerto 587 es la solución. Token: ${token}`
    };

    console.log("1. Verificando conexión (STARTTLS)...");
    await transporter.verify();
    
    console.log("2. Enviando correo...");
    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };il };