// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Autobot = require('../models/Autobot'); // Ya lo tenías, ¡Excelente!

//LOG TEMPORAL

//console.log(`[EMAIL DEBUG] USER: ${process.env.EMAIL_USER}`);
//console.log(`[EMAIL DEBUG] PASS LOADED (First 4 chars): ${process.env.EMAIL_PASS ? process.env.EMAIL_PASS.substring(0, 4) : 'NONE'}`);

// Nodemailer transporter setup (replace with your email service details)
const transporter = nodemailer.createTransport({    
    host: 'smtp.gmail.com', 
    port: 465, 
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});

exports.requestToken = async (req, res) => {
    const { email } = req.body;

    try {
        let user = await User.findOne({ email });
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = Date.now() + 10 * 60 * 1000;

        if (!user) {
            user = new User({ email, token, tokenExpires });
        } else {
            user.token = token;
            user.tokenExpires = tokenExpires;
        }
        await user.save();

        const mailOptions = {
            from: `"BSB Bot" <${process.env.EMAIL_USER}>`, // Remitente formateado
            to: email,
            subject: 'BSB - Your Login Token',
            html: `
                <div style="font-family: sans-serif; padding: 20px; background-color: #f4f4f4;">
                    <h2 style="color: #10b981;">BSB - Bitmart Spot Bots</h2>
                    <p>Your login token is: <b style="font-size: 24px; color: #3b82f6;">${token}</b></p>
                    <p>This code is valid for 10 minutes.</p>
                </div>
            `
        };

        // CORRECCIÓN: O usamos await o usamos callback, no ambos.
        try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado con éxito:', info.response);
    
    // IMPORTANTE: Responder al frontend aquí dentro
    return res.status(200).json({ 
        success: true, 
        message: 'A token has been sent to your email.' 
    });
} catch (mailError) {
    console.error('❌ Error de Nodemailer:', mailError);
    return res.status(500).json({ 
        error: 'Error sending email. Please try again.' 
    });
}

exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;

    console.log('--- DEBUG: Verify Token Request ---');
    console.log('Token recibido del frontend:', token);
    console.log('Email recibido del frontend:', email);

    try {
        const user = await User.findOne({ email });

        console.log('Usuario encontrado en la base de datos:', user);
        if (user) {
            console.log('Token guardado en la DB:', user.token);
            console.log('Expiración del token en la DB:', user.tokenExpires);
        }
        console.log('--- FIN DE DEBUG ---');

        if (!user) {
            console.error(`[VERIFY TOKEN] User not found for email: ${email}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.token || user.token !== token || user.tokenExpires < Date.now()) {
            let reason = '';
            if (!user.token) {
                reason = 'No token stored for user.';
            } else if (user.token !== token) {
                reason = `Token mismatch. Provided: ${token}, Stored: ${user.token}`;
            } else if (user.tokenExpires < Date.now()) {
                reason = `Token expired. Expires: ${new Date(user.tokenExpires).toLocaleString()}, Current: ${new Date().toLocaleString()}`;
            }
            console.error(`[VERIFY TOKEN ERROR] Invalid or expired token for email: ${email}. Reason: ${reason}`);

            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        // 🛑 INICIO DE LA CORRECCIÓN CLAVE: Asignar un Autobot si no tiene uno
        if (!user.autobotId) {
            console.log(`[VERIFY TOKEN] Usuario ${user.email} no tiene autobotId. Creando uno por defecto.`);
            
            // 1. Crear un nuevo Autobot. Usamos la ID del usuario como referencia.
            const newBot = new Autobot({ 
                userId: user._id, 
                // Asegúrate de incluir cualquier campo 'required' que tenga tu modelo Autobot.
                // Por ejemplo, si tiene un campo 'name', pon: name: 'Bot Principal' 
            });
            await newBot.save();
            
            // 2. Asignar la referencia del nuevo bot al documento del usuario
            user.autobotId = newBot._id; 
            // NOTA: await user.save() se hará al final de la función.
        }
        // 🛑 FIN DE LA CORRECCIÓN CLAVE

        // Generar JWT para la sesión persistente
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, autobotId: user.autobotId }, // ¡Ahora tiene valor garantizado!
            process.env.JWT_SECRET,
            { expiresIn: '365d' } // Token válido por 365 días
        );

        // **CORRECCIÓN:** Guardar el token de sesión JWT en la base de datos
        // He añadido un nuevo campo 'jwtToken' para guardar el token de sesión
        user.jwtToken = jwtToken;

        // Opcionalmente, puedes no borrar el token numérico, como solicitaste
        // user.token = null;
        // user.tokenExpires = null;
        
        // Guardar el documento actualizado en la base de datos (guarda el jwtToken y el autobotId)
        await user.save();

        res.status(200).json({ 
            message: 'Login successful!', 
            token: jwtToken, // Esto envía el token al frontend para que lo guarde
            user: { id: user._id, email: user.email, autobotId: user.autobotId } // Opcional: enviar el ID del bot al frontend
        });

    } catch (error) {
        console.error('Error verifying token (catch block):', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};