// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

/**
 * Recopila todos los datos de los campos de configuración.
 * Se han añadido protecciones para evitar errores si un ID no existe en el DOM.
 */
export function getBotConfiguration() {
    // Función auxiliar para obtener valores numéricos de forma segura
    const getNum = (id) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    };

    // Capturamos valores comunes
    const priceVar = getNum('auincrement'); // Distancia entre órdenes DCA (%)
    const sizeVar = 1.0; // Valor por defecto si 'audecrement' no existe o se requiere fijo
    const profitTrigger = getNum('autrigger'); // % Objetivo de salida

    const stopAtCycleEndEl = document.getElementById('au-stop-at-cycle-end');
    const stopAtCycleEnd = stopAtCycleEndEl ? stopAtCycleEndEl.checked : false;

    // Estructura exacta que espera el Backend para no romper la lógica del bot
    const config = {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            enabled: true,
            amountUsdt: getNum('auamount-usdt'),
            purchaseUsdt: 5.0, // Valor base de seguridad para la primera orden
            price_var: priceVar,
            size_var: sizeVar,
            trigger: profitTrigger,
        },
        short: {
            enabled: true,
            amountBtc: getNum('auamount-btc'),
            sellBtc: 0.0001, // Valor base de seguridad
            price_var: priceVar,
            size_var: sizeVar,
            trigger: profitTrigger,
        },
        options: {
            stopAtCycleEnd: stopAtCycleEnd,
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
        const token = localStorage.getItem('token');
        
        if (!token) return; // Silencioso para no molestar al usuario en auto-guardado

        // Usamos la ruta que el servidor de Render tiene mapeada
        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config }),
        });

        if (!response.ok) {
            const result = await response.json();
            console.warn('Config auto-save warning:', result.message);
        }
    } catch (error) {
        console.error('Failed to auto-send config:', error);
    }
}

/**
 * Envía una solicitud para iniciar o detener el bot.
 */
export async function toggleBotState(isRunning, config) {
    // Ajuste de rutas para que coincidan con el controlador del Bot
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config })
        });

        const data = await response.json();
        
        if (data.success) {
            displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully.`, 'success');
        } else {
            displayMessage(`Error: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('Error de red en toggleBotState:', error);
        displayMessage('Connection failed.', 'error');
    }
}

// =================================================================
// 💡 ANALÍTICAS DEL DASHBOARD (Rutas v1)
// =================================================================

export async function fetchEquityCurveData() {
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/equity-curve`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Equity Curve Error:', error);
        return [];
    }
}

export async function fetchCycleKpis() {
    const token = localStorage.getItem('token');
    if (!token) return { averageProfitPercentage: 0, totalCycles: 0 };

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/kpis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return { averageProfitPercentage: 0, totalCycles: 0 };
        
        const data = await response.json();
        return Array.isArray(data) ? (data[0] || data) : data;
    } catch (error) {
        console.error('KPIs Error:', error);
        return { averageProfitPercentage: 0, totalCycles: 0 };
    }
}