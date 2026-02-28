const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    // 'all', 'current', 'advanced' o 'personal'
    category: { 
        type: String, 
        required: true,
        index: true 
    },
    // Solo se llena si la categoría es 'personal'
    recipient: { 
        type: String, 
        lowercase: true, 
        index: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    date: { 
        type: Date, 
        default: Date.now 
    }
});

// Creamos un índice para que el mantenimiento de 7 días sea automático y veloz
NotificationSchema.index({ date: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);