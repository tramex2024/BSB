// src/server/controllers/authController.js

// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Autobot = require('../models/Autobot');
const { sendTokenEmail } = require('../utils/email'); // <-- PASO 2: Llamamos a tu nuevo archivo

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

        // PASO 3: Respuesta inmediata al frontend
        res.status(200).json({ success: true, message: 'Token generated' });

        // PASO 4: Usar el nuevo archivo utils/email.js para enviar el correo
        sendTokenEmail(email, token)
            .then(() => console.log('✅ Correo enviado con el nuevo util/email.js'))
            .catch(err => console.error('❌ Error en el nuevo util/email.js:', err.message));

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