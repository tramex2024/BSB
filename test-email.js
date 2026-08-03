// test-email.js
const nodemailer = require('nodemailer');

// Credenciales proporcionadas
const EMAIL_USER = 'info.nexuslabs@gmail.com';
const EMAIL_PASS = 'pceifioovapsofol'; //'lukedknjgjvbfeaq'; 
const EMAIL_TARGET = 'tramex2024@gmail.com';

async function sendTestEmail() {
    console.log("🚀 Iniciando prueba de envío...");

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    try {
        const info = await transporter.sendMail({
            from: `"BSB Test" <${EMAIL_USER}>`,
            to: EMAIL_TARGET,
            subject: "Prueba de conexión BSB 2026",
            text: "Si recibes este correo, la configuración de Gmail es correcta y está lista para usarse en el bot.",
            html: "<b>Configuración correcta.</b><br>El bot puede comunicarse con Gmail."
        });

        console.log("✅ ¡Correo enviado con éxito!");
        console.log("ID del mensaje:", info.messageId);
    } catch (error) {
        console.error("❌ Error al enviar el correo:");
        console.error(error.message);
    }
}

sendTestEmail();