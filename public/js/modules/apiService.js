// public/js/modules/apiService.js

// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Session not found." };

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...defaultOptions, ...options });
        return await response.json();
    } catch (error) {
        console.error(`Error at ${endpoint}:`, error);
        return { success: false, message: "Connection error." };
    }
}

export function getBotConfiguration() {
    const getNum = (id) => {
        const el = document.getElementById(id);
        const val = el ? el.value : "0";
        return parseFloat(val) || 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    // --- CORRECCIÓN CRÍTICA: Mapeo simétrico en USDT ---
    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamount-usdt'),
            purchaseUsdt: getNum('aupurchase-usdt'),
            trigger: getNum('autrigger'), 
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            // Ahora el Short usa los valores de USDT para mantener la lógica exponencial
            amountUsdt: getNum('auamount-usdt'), 
            purchaseUsdt: getNum('aupurchase-usdt'),
            trigger: getNum('autrigger'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

export async function sendConfigToBackend() {
    try {
        const config = getBotConfiguration();
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });
        if (!data.success) console.warn('Auto-save error:', data.message);
    } catch (e) { console.error("Config sync failed", e); }
}

export async function toggleBotState(isRunning) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    
    // Si vamos a arrancar, obtenemos la config limpia
    let config = {};
    if (!isRunning) {
        config = getBotConfiguration();
        console.log("🚀 Enviando configuración de arranque:", config);
    }

    const btn = document.getElementById('austart-btn');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
        console.error("Backend rejection:", data);
    }

    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
    return data;
}

// ... rest of the file stays the same