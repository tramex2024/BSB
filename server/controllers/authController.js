// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Autobot = require('../models/Autobot');

// CONFIGURACIÓN OPTIMIZADA PARA RENDER
const transporter = nodemailer.createTransport({  
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    },
    pool: true, // Reutiliza conexiones para no saturar el bot
    connectionTimeout: 10000,
    socketTimeout: 10000
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
        await user.save(); // El token ya está seguro en la DB

        // RESPONDEMOS AL FRONTEND ANTES DEL ENVÍO
        // Esto evita que el usuario vea un Error 500 si Gmail tarda en responder
        res.status(200).json({ success: true, message: 'Token generated' });

        // ENVÍO EN SEGUNDO PLANO (Background)
        const mailOptions = {
            from: `"BSB Bot" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'BSB - Your Login Token',
            html: `<div style="background:#121220; color:white; padding:20px; border-radius:10px; border:1px solid #3b82f6;">
                    <h2>Token: ${token}</h2>
                   </div>`
        };

        transporter.sendMail(mailOptions).catch(err => {
            console.error('❌ Error asíncrono de correo:', err.message);
        });

    } catch (error) {
        console.error('❌ Error crítico en requestToken:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Database error' });
        }
    }
};

exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;
    try {
        const user = await User.findOne({ email });

        if (!user || !user.token || user.token !== token || user.tokenExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        if (!user.autobotId) {
            const newBot = new Autobot({ userId: user._id });
            await newBot.save();
            user.autobotId = newBot._id;
        }

        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, autobotId: user.autobotId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        user.jwtToken = jwtToken;
        await user.save();

        return res.status(200).json({ 
            token: jwtToken,
            user: { id: user._id, email: user.email, autobotId: user.autobotId }
        });

    } catch (error) {
        console.error('❌ Error en verifyToken:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};