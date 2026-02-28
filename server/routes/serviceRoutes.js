/**
 * routes/serviceRoutes.js - Rutas de Pagos y Soporte (BSB 2026)
 */
const express = require('express');
const router = express.Router();
const { sendSupportTicketEmail, sendPaymentNotificationEmail } = require('../utils/email');

// --- RUTA 1: VERIFICACIÓN DE PAGOS ---
router.post('/payments/verify', async (req, res) => {
    try {
        const { userId, email, type, amount, hash, timestamp } = req.body;

        // Determinamos los días según el monto (Lógica original BSB)
        let daysToAssign = 30; // Por defecto 1 mes
        if (amount === "40") {
            daysToAssign = 90; // 3 meses
        } else if (amount === "150") {
            daysToAssign = 365; // 1 año
        } else if (amount === "Other") {
            daysToAssign = 7; // Prueba de 7 días
        }

        // Enviamos el correo de notificación al Admin
        await sendPaymentNotificationEmail({
            userId,
            email,
            type,
            amount,
            hash,
            timestamp,
            suggestedDays: daysToAssign 
        });

        res.status(200).json({ 
            success: true, 
            message: "Payment submitted! Activation pending manual hash verification." 
        });

    } catch (error) {
        console.error("❌ Payment Route Error:", error);
        res.status(500).json({ success: false, message: "Server error processing payment" });
    }
});

// --- RUTA 2: TICKETS DE SOPORTE ---
router.post('/support/ticket', async (req, res) => {
    try {
        const { userId, email, category, message } = req.body;
        const ticketId = `BSB-${Math.floor(1000 + Math.random() * 9000)}`;

        // Llamada al servicio de Brevo
        await sendSupportTicketEmail({
            userId,
            email,
            category,
            message,
            ticketId
        });

        res.status(200).json({ 
            success: true, 
            message: "Ticket sent via Brevo successfully",
            ticketId 
        });

    } catch (error) {
        console.error("❌ Support Ticket Error:", error);
        res.status(500).json({ success: false, message: "Email delivery failed" });
    }
});

module.exports = router;