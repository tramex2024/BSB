// src/server/utils/email.js

// src/server/utils/email.js
const nodemailer = require('nodemailer');

// Importante: No ponemos dotenv aquí para que use las variables de Render directamente
async function sendTokenEmail(email, token) {
    // Usamos exactamente los nombres de variables que tienes en el test
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    // Para esta fase de prueba, seguimos usando el target fijo como pediste
    const target = 'tramex2024@gmail.com'; 

    console.log("--- 🏁 Iniciando utilidad basada en test-mail.js ---");
    console.log("- De:", user);
    console.log("- Para:", target);

    // Configuración IDÉNTICA a tu test-mail.js
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: user,
            pass: pass
        }
    });

    const mailOptions = {
        from: `"Nexus Labs Test" <${user}>`, 
        to: target, 
        subject: '🚀 Prueba de Envío BSB (Desde Aplicación)',
        html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #3b82f6; padding: 20px; border-radius: 10px;">
                <h2 style="color: #3b82f6;">Verificación desde el Util</h2>
                <p>Token generado: <strong>${token}</strong></p>
                <p>Si recibes esto, la integración del util funciona.</p>
            </div>
        `
    };

    // Verificación y envío igual que en el test
    await transporter.verify();
    return transporter.sendMail(mailOptions);
}

module.exports = { sendTokenEmail };