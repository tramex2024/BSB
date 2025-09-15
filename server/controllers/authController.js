// src/server/controllers/authController.js (o la ruta donde lo tengas)

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const randToken = require('rand-token'); // Considera usar 'crypto' para mayor seguridad en el token

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
        // const token = randToken.generate(6, '0123456789'); // This generates random numbers
        // Para asegurar que sea un string de 6 dígitos numéricos:
        const token = Math.floor(100000 + Math.random() * 900000).toString(); // Genera un número de 6 dígitos como string
        const tokenExpires = Date.now() + 10 * 60 * 1000; // Token valid for 10 minutes

        if (!user) {
            // New user, create an entry
            user = new User({ email, token, tokenExpires });
            await user.save();
        } else {
            // Existing user, update token
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

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'A token has been sent to your email.' });

    } catch (error) {
        console.error('Error requesting token:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};

exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;

    // --- AÑADE ESTAS LÍNEAS DE CÓDIGO ---
    console.log('--- DEBUG: Verify Token Request ---');
    console.log('Token recibido del frontend:', token);
    console.log('Email recibido del frontend:', email);
    // --- FIN DE LÍNEAS AÑADIDAS ---

    try {
        const user = await User.findOne({ email });

    // --- AÑADE ESTAS OTRAS LÍNEAS ---
        console.log('Usuario encontrado en la base de datos:', user);
        if (user) {
            console.log('Token guardado en la DB:', user.token);
            console.log('Expiración del token en la DB:', user.tokenExpires);
        }
        console.log('--- FIN DE DEBUG ---');
    // --- FIN DE LÍNEAS AÑADIDAS ---

        if (!user) {
            console.error(`[VERIFY TOKEN] User not found for email: ${email}`); // Añadir log
            return res.status(404).json({ message: 'User not found.' });
        }

        // --- AÑADIR CONSOLE.ERROR AQUÍ PARA DEPURAR EL 400 ---
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
            // console.error(`[DEBUG] Stored Token: ${user.token}, Provided Token: ${token}, Stored Expires: ${new Date(user.tokenExpires).toISOString()}, Current Time: ${new Date().toISOString()}`);

            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        // Token is valid, clear it for security
        user.token = null; // Establecer a null es correcto si el campo no es `required: true`
        user.tokenExpires = null; // Establecer a null es correcto
        await user.save();

        // Generate JWT for persistent login
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token valid for 7 days
        );

        res.status(200).json({ message: 'Login successful!', token: jwtToken, user: { id: user._id, email: user.email } });

    } catch (error) {
        console.error('Error verifying token (catch block):', error); // Mensaje más específico
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};

// ... Si tienes otras funciones de BitMart API Keys en este archivo, déjalas ...