// src/server/utils/email.js

const nodemailer = require('nodemailer');

/**
 * Utiliza EMAIL_USER y EMAIL_PASS configurados en el panel de Render
 */
async function sendTokenEmail(email, token) {
    // Render inyecta estas variables automáticamente en el entorno de ejecución
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const target = 'tramex2024@gmail.com'; // Destinatario fijo para esta prueba

    console.log("--- 🏁 Iniciando utilidad con variables de Render ---");
    console.log("- Remitente (desde Render):", user);
    console.log("- Destinatario fijo:", target);

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true para 465, false para otros puertos
        auth: {
            user: user,
            pass: pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000
    });

    const mailOptions = {
        from: `"BSB Engine" <${user}>`,
        to: target,
        subject: '🚀 Prueba de Conexión BSB',
        text: `Token de acceso: ${token}. Enviado usando variables de entorno de Render.`
    };

    console.log("1. Verificando protocolo STARTTLS (Puerto 587)...");
    await transporter.verify();
    
    console.log("2. Enviando mensaje...");
    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };