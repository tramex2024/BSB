// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Autobot = require('../models/Autobot');
const { sendTokenEmail } = require('../utils/email'); // Importamos la utilidad simplificada

/**
 * Solicita un token de acceso y lo envía por correo
 */
exports.requestToken = async (req, res) => {
    const { email } = req.body;
    try {
        // 1. Generar token de 6 dígitos y expiración (10 min)
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = Date.now() + 10 * 60 * 1000;

        // 2. Guardar o actualizar el usuario en MongoDB
        await User.findOneAndUpdate(
            { email },
            { token, tokenExpires },
            { upsert: true, new: true }
        );

        console.log(`--- 🏁 Iniciando flujo para: ${email} ---`);
        console.log("1. Token guardado en DB.");

        // 3. EJECUCIÓN DE LA PRUEBA (Paso 2 de tu plan)
        // El await hace que el frontend se quede en "Processing" hasta que esto termine
        console.log("2. Llamando a utils/email.js (Configuración directa)...");
        await sendTokenEmail(email, token);
        
        console.log("3. ✅ Envío exitoso. Notificando al frontend.");

        // 4. Si llegamos aquí, todo salió bien
        return res.status(200).json({ 
            success: true, 
            message: 'Token sent!' 
        });

    } catch (error) {
        // Si el envío falla, el error se captura aquí
        console.error('❌ Error en el flujo de solicitud:', error.message);
        
        return res.status(500).json({ 
            error: 'Error de envío detectado',
            details: error.message 
        });
    }
};

/**
 * Verifica el token y genera la sesión (JWT)
 */
exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;
    try {
        const user = await User.findOne({ email });

        // Validaciones de seguridad
        if (!user || !user.token || user.token !== token || user.tokenExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        // Si el usuario no tiene un bot asignado, se le crea uno
        if (!user.autobotId) {
            const newBot = new Autobot({ userId: user._id });
            await newBot.save();
            user.autobotId = newBot._id;
        }

        // Generar JWT para la sesión
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, autobotId: user.autobotId },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        // Guardar token de sesión y limpiar el token de un solo uso
        user.jwtToken = jwtToken;
        user.token = null;
        user.tokenExpires = null;
        await user.save();

        return res.status(200).json({ 
            message: 'Login successful!',
            token: jwtToken,
            user: { id: user._id, email: user.email, autobotId: user.autobotId }
        });

    } catch (error) {
        console.error('❌ Error en verifyToken:', error);
        res.status(500).json({ message: 'Server error during verification.' });
    }
};