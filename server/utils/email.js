// src/server/utils/email.js

const nodemailer = require('nodemailer');
// Usamos dotenv aquí para que lea el archivo de la carpeta como pediste
require('dotenv').config({ path: __dirname + '/.env' }); 

async function sendTokenEmail(email, token) {
    // LOGS DE PRUEBA (Para ver en Render si detecta las claves)
    console.log("--- 🔍 Ejecutando Envío desde Utils ---");
    console.log("Remitente:", process.env.EMAIL_USER);

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email, 
        subject: '🚀 Prueba de Envío BSB',
        text: `Tu token de acceso es: ${token}`
    };

    // Esto devuelve la promesa para que el controlador pueda hacer el "await"
    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };