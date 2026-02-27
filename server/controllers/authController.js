/**
 * BSB/server/controllers/authController.js
 * CONTROLADOR DE AUTENTICACIÓN (Passwordless & JWT)
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Autobot = require('../models/Autobot');
const { sendTokenEmail } = require('../utils/email');

/**
 * Solicita un token de acceso (OTP) y lo envía por correo
 */
exports.requestToken = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        // 1. Generar token de 6 dígitos y expiración (10 min)
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = Date.now() + 10 * 60 * 1000;

        // 2. Guardar o actualizar el usuario en MongoDB
        // Usamos upsert para registrar nuevos usuarios automáticamente
        await User.findOneAndUpdate(
            { email: email.toLowerCase().trim() },
            { token, tokenExpires },
            { upsert: true, new: true }
        );

        console.log(`[AUTH] 📧 Generando acceso para: ${email}`);

        // 3. Envío del correo electrónico
        // Esperamos a que el servicio de correo confirme el envío
        await sendTokenEmail(email, token);
        
        console.log(`[AUTH] ✅ OTP enviado con éxito a ${email}`);

        return res.status(200).json({ 
            success: true, 
            message: 'Token sent to your email!' 
        });

    } catch (error) {
        console.error('❌ [AUTH ERROR] RequestToken:', error.message);
        return res.status(500).json({ 
            error: 'Failed to send token',
            details: error.message 
        });
    }
};

/**
 * Verifica el OTP y genera la sesión persistente (JWT)
 */
exports.verifyToken = async (req, res) => {
    const { email, token } = req.body;
    
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // 1. Validaciones de seguridad del OTP
        if (!user || !user.token || user.token !== token || user.tokenExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        // 2. Lógica Multiusuario: Asegurar documento Autobot
        let bot = await Autobot.findOne({ userId: user._id });
        
        if (!bot) {
            console.log(`[AUTH] 🤖 Creando instancia de bot inicial para ${email}`);
            bot = new Autobot({ 
                userId: user._id,
                lstate: 'STOPPED'
            });
            await bot.save();
        }

        // 3. Generar JWT (Incluimos el ROLE dentro del token)
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, role: user.role }, // <-- Agregamos role aquí
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        // 4. Limpieza y Persistencia de Sesión
        user.jwtToken = jwtToken; 
        user.token = null;        
        user.tokenExpires = null;
        await user.save();

        console.log(`[AUTH] 🚀 Login exitoso: ${email} (Role: ${user.role})`);

        // 5. Respuesta al Frontend
        return res.status(200).json({ 
            success: true,
            message: 'Login successful!',
            token: jwtToken,
            user: { 
                id: user._id, 
                email: user.email,
                role: user.role, // <-- Enviamos el role al frontend
                hasApiKeys: !!user.bitmartApiKey 
            }
        });

    } catch (error) {
        console.error('❌ [AUTH ERROR] VerifyToken:', error);
        res.status(500).json({ message: 'Server error during verification.' });
    }
};