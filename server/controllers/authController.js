const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const randToken = require('rand-token');

// Nodemailer transporter setup (replace with your email service details)
const transporter = nodemailer.createTransport({
    service: 'gmail', // e.g., 'gmail', 'SendGrid'
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.requestToken = async (req, res) => {
    const { email } = req.body;

    try {
        let user = await User.findOne({ email });
        const token = randToken.generate(6, '0123456789'); // 6-digit numeric token
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

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.token !== token || user.tokenExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired token.' });
        }

        // Token is valid, clear it for security
        user.token = null;
        user.tokenExpires = null;
        await user.save();

        // Generate JWT for persistent login
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token valid for 7 days
        );

        res.status(200).json({ message: 'Login successful!', token: jwtToken, user: { id: user._id, email: user.email } });

    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};