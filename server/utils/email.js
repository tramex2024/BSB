// server/utils/email.js
const nodemailer = require('nodemailer');

const sendTokenEmail = async (email, token) => {
    // Usamos 'service: gmail' que ya vimos que es más compatible
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: `"BSB Bot" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'BSB - Your Access Token',
        html: `
            <div style="font-family: sans-serif; padding: 20px; background-color: #121220; color: white; border-radius: 10px; border: 1px solid #3b82f6;">
                <h2 style="color: #3b82f6;">BSB Authentication</h2>
                <p>Use the following token to access your trading dashboard:</p>
                <div style="background: #1e1e30; padding: 15px; text-align: center; border-radius: 5px;">
                    <span style="font-size: 32px; font-weight: bold; color: #10b981; letter-spacing: 5px;">${token}</span>
                </div>
                <p style="font-size: 12px; color: #888; margin-top: 20px;">This token expires in 10 minutes.</p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
};

module.exports = { sendTokenEmail };