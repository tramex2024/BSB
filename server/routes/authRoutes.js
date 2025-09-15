// server/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, message: 'User with that email already exists.' });
        }
        
        user = new User({ email, password });
        await user.save();
        
        // Generar un token JWT para la sesión
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Guardar el token y su expiración en la base de datos
        user.token = token;
        user.tokenExpires = new Date(Date.now() + 3600000); // 1 hora
        await user.save();

        res.status(201).json({ success: true, message: 'User registered successfully.', token });
    } catch (error) {
        console.error('Error in user registration:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// @route   POST /api/auth/login
// @desc    Login user & get token
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }

        // Generar un nuevo token JWT para la sesión actual
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        
        // **CORRECCIÓN:** Guardar el nuevo token y su expiración en la base de datos
        user.token = token;
        user.tokenExpires = new Date(Date.now() + 3600000); // 1 hora en milisegundos
        await user.save(); // Guardar el documento actualizado en la base de datos

        res.status(200).json({
            success: true,
            message: 'Login successful.',
            token: token,
            userId: user._id,
        });

    } catch (error) {
        console.error('Error in user login:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user & clear token
router.post('/logout', async (req, res) => {
    try {
        // En un enfoque con tokens, el logout se maneja en el cliente eliminando el token.
        // Pero si el token se guarda en la base de datos, lo eliminamos del registro del usuario.
        const user = await User.findOne({ token: req.body.token });
        if (user) {
            user.token = null;
            user.tokenExpires = null;
            await user.save();
        }
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (error) {
        console.error('Error in user logout:', error);
        res.status(500).json({ success: false, message: 'Server error during logout.' });
    }
});

module.exports = router;