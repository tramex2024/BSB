// src/server/controllers/authController.js

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Autobot = require('../models/Autobot');

const transporter = nodemailer.createTransport({
    service: 'gmail', // Usar el shortcut de nodemailer para Gmail
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
            from: `"BSB Authentication" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'BSB - Your Login Token',
            html: `
                <div style="font-family: sans-serif; padding: 20px; background-color: #121220; color: white; border-radius: 10px; border: 1px solid #3b82f6;">
                    <h2 style="color: #3b82f6;">BSB Bot Access</h2>
                    <p>Your login token is: <strong style="font-size: 26px; color: #10b981; letter-spacing: 2px;">${token}</strong></p>
                    <p>This code is valid for 10 minutes.</p>
                    <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                    <p style="font-size: 11px; color: #888;">Security notice: If you did not request this code, please ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Token enviado con éxito a:', email);
        return res.status(200).json({ success: true, message: 'Token sent!' });

    } catch (error) {
        console.error('❌ Error en requestToken:', error);
        res.status(500).json({ error: 'Server error or mail failed.' });
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
            message: 'Login successful!', 
            token: jwtToken,
            user: { id: user._id, email: user.email, autobotId: user.autobotId }
        });

    } catch (error) {
        console.error('❌ Error en verifyToken:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};