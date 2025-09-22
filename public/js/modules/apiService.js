// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART } from '../main.js';

const BACKEND_URL = 'https://bsb-ppex.onrender.com';

/**
 * Recopila todos los datos de los campos de configuración.
 * @returns {object} Un objeto con la configuración del bot.
 */
export function getBotConfiguration() {
    const config = {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            amountUsdt: parseFloat(document.getElementById('auamount-usdt').value),
            purchaseUsdt: parseFloat(document.getElementById('aupurchase-usdt').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        short: {
            amountBtc: parseFloat(document.getElementById('auamount-btc').value),
            sellBtc: parseFloat(document.getElementById('aupurchase-btc').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        options: {
            stopAtCycleEnd: document.getElementById('au-stop-at-cycle-end').checked,
        },
    };
    return config;
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
export async function sendConfigToBackend() {
    try {
        const config = getBotConfiguration();
        console.log('Enviando configuración al backend:', config);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró el token de autenticación.');
            displayMessage('Authentication token not found. Please log in again.', 'error');
            return;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config }),
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('Configuración enviada con éxito. Respuesta del servidor:', result);
            displayMessage('Configuración y estado inicial actualizados con éxito.', 'success');
        } else {
            console.error('Error al actualizar la configuración en el backend:', result.message);
            displayMessage(`Failed to update config on backend: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Failed to send config:', error);
        displayMessage('Failed to connect to backend.', 'error');
    }
}

/**
 * Envía una solicitud para iniciar o detener el bot.
 * @param {boolean} isRunning - Indica si el bot está corriendo.
 * @param {object} config - La configuración del bot para enviar al iniciar.
 * @returns {Promise<void>}
 */
export async function toggleBotState(isRunning, config) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    let body = {};

    if (!isRunning) {
        body = { config };
    }

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!data.success) {
            console.error(`Error al ${isRunning ? 'detener' : 'iniciar'} el bot:`, data.message);
            displayMessage(`Error: ${data.message}`, 'error');
        } else {
            displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully.`, 'success');
        }
    } catch (error) {
        console.error(`Error de red al ${isRunning ? 'detener' : 'iniciar'} el bot:`, error);
        displayMessage('Failed to connect to backend.', 'error');
    }
}