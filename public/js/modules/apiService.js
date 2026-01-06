// public/js/modules/apiService.js

// public/js/modules/apiService.js
import { displayMessage } from './uiManager.js';
import { BACKEND_URL } from '../main.js';

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
        return el ? parseFloat(el.value) || 0 : 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt'),
            purchaseUsdt: getNum('aupurchasel-usdt'),
            trigger: getNum('autrigger'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'), // Ahora mapeado a AmountS
            purchaseUsdt: getNum('aupurchases-usdt'), // Ahora mapeado a PurchaseS
            trigger: getNum('autrigger'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
}

export async function toggleBotState(isRunning) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const config = isRunning ? {} : getBotConfiguration();

    const btn = document.getElementById('austart-btn');
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}