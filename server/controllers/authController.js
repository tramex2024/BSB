// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Nodemailer transporter setup (replace with your email service details)
const transporter = nodemailer.createTransport({
    service: 'gmail', // e.g., 'gmail', 'SendGrid'
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // ¡Asegúrate de que esta sea la contraseña de aplicación de Google!
    }
});

exports.requestToken = async (req, res) => {
    const { email } = req.body;

    try {
        let user = await User.findOne({ email });
        // Generar un token de 6 dígitos numérico
        const token = Math.floor(100000 + Math.random() * 900000).toString(); // Genera un número de 6 dígitos como string
        const tokenExpires = Date.now() + 10 * 60 * 1000; // Token válido por 10 minutos

        if (!user) {
            // Nuevo usuario, crea una entrada
            user = new User({ email, token, tokenExpires });
            await user.save();
        } else {
            // Usuario existente, actualiza el token
            user.token = token;
            user.tokenExpires = tokenExpires;
            await user.save();
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'BSB - Your Login Token',
            html: `<p>Your login token for BSB is: <strong>${token}</strong>. It is valid for 10 minutes.</p>`
        };

        // Usa un callback para detectar errores de envío del correo.
        await transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error al enviar el correo:', error);
                // Si hay un error aquí, la respuesta al usuario aún será 200 para no dar pistas a un atacante,
                // pero tú verás el error en el log del servidor.
            } else {
                console.log('Correo enviado:', info.response);
            }
        });

        res.status(200).json({ message: 'A token has been sent to your email.' });

    } catch (error) {
        console.error('Error general en requestToken:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};

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

        // Generar JWT para la sesión persistente
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '365d' } // Token válido por 365 días
        );

        // **CORRECCIÓN:** Guardar el token de sesión JWT en la base de datos
        // He añadido un nuevo campo 'jwtToken' para guardar el token de sesión
        user.jwtToken = jwtToken;

        // Opcionalmente, puedes no borrar el token numérico, como solicitaste
        // user.token = null;
        // user.tokenExpires = null;
        
        // Guardar el documento actualizado en la base de datos
        await user.save();

        res.status(200).json({ 
            message: 'Login successful!', 
            token: jwtToken, // Esto envía el token al frontend para que lo guarde
            user: { id: user._id, email: user.email } 
        });

    } catch (error) {
        console.error('Error verifying token (catch block):', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};