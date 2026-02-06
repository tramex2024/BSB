// public/js/modules/orderActions.js
import { BACKEND_URL } from '../main.js';
import { displayMessage } from './ui/notifications.js';

/**
 * Cancela una orden específica en BitMart a través del backend
 * @param {string} orderId - ID de la orden a cancelar
 */
export async function cancelOrder(orderId) {
    if (!orderId) return;

    // Confirmación visual inmediata en el botón (opcional)
    console.log(`[ORDER] Solicitando cancelación de: ${orderId}`);

    try {
        const response = await fetch(`${BACKEND_URL}/api/trade/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ orderId })
        });

        const data = await response.json();

        if (data.success) {
            displayMessage(`Order ${orderId.toString().slice(-6)} cancelled`, 'success');
        } else {
            console.error("Error al cancelar:", data.message);
            displayMessage(data.message || "Failed to cancel order", 'error');
        }
    } catch (error) {
        console.error("Network error cancelling order:", error);
        displayMessage("Connection error while cancelling", 'error');
    }
}

// Hacerla disponible globalmente para los botones generados por innerHTML
window.cancelOrder = cancelOrder;