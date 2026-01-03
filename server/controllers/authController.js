// src/server/controllers/authController.js

// src/server/controllers/authController.js

// src/server/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendTokenEmail } = require('../utils/email'); // Llamada al nuevo archivo

exports.requestToken = async (req, res) => {
    const { email } = req.body;
    try {
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = Date.now() + 10 * 60 * 1000;

        await User.findOneAndUpdate(
            { email },
            { token, tokenExpires },
            { upsert: true, new: true }
        );

        // EJECUCIÓN DEL ARCHIVO DE PRUEBA
        // El servidor se queda en "Processing" hasta que este await termine
        console.log("Llamando a sendTokenEmail...");
        await sendTokenEmail(email, token);
        
        console.log("✅ Envío exitoso según el util de prueba.");
        return res.status(200).json({ success: true, message: 'Token sent!' });

    } catch (error) {
        console.error('❌ Error detectado en la ejecución del paso 2:', error.message);
        return res.status(500).json({ error: 'Error de envío: ' + error.message });
    }
};

// ... verifyToken se queda igual ...
exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !user.token || user.token !== token || user.tokenExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );
        return res.status(200).json({ token: jwtToken });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};