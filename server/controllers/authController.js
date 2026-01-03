// src/server/controllers/authController.js

// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Autobot = require('../models/Autobot');
const { sendTokenEmail } = require('../utils/email'); // Mantenemos tu nuevo util

exports.requestToken = async (req, res) => {
    const { email } = req.body;
    try {
        // 1. Buscamos o generamos el usuario y el token
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = Date.now() + 10 * 60 * 1000;

        await User.findOneAndUpdate(
            { email },
            { token, tokenExpires },
            { upsert: true, new: true }
        );

        // 2. AHORA SÍ ESPERAMOS: El await asegura que no pase de aquí hasta que el mail se envíe
        console.log(`Intentando enviar email a ${email}...`);
        await sendTokenEmail(email, token); 
        
        console.log('✅ Correo enviado con éxito. Respondiendo al cliente.');

        // 3. Solo si el await de arriba fue exitoso, enviamos el OK al frontend
        return res.status(200).json({ 
            success: true, 
            message: 'Token sent to your email!' 
        });

    } catch (error) {
        // Si sendTokenEmail falla, caerá aquí y el frontend recibirá el error 500
        console.error('❌ Error en el proceso de requestToken:', error.message);
        
        return res.status(500).json({ 
            error: 'Failed to send email. Please check server logs.',
            details: error.message 
        });
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