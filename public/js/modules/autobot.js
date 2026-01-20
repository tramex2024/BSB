/**
 * public/js/modules/autobot.js
 * Gestión de la vista del Autobot con Auto-Save Exponencial.
 */

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { displayMessage, updateControlsState } from './uiManager.js';
import { toggleBotSideState } from './apiService.js'; 
import { socket, currentBotState, TRADE_SYMBOL_TV, logStatus, BACKEND_URL } from '../main.js';

const MIN_USDT_AMOUNT = 6.00;
let currentTab = 'opened';
let saveTimeout; // Para el auto-guardado

/**
 * Pinta los valores de la DB en los inputs de la UI.
 */
export function updateAutobotInputs(state) {
    if (!state || !state.config) return;
    const cfg = state.config;

    const mapping = {
        'auamountl-usdt': cfg.long?.amountUsdt,
        'aupurchasel-usdt': cfg.long?.purchaseUsdt,
        'auincrementl': cfg.long?.size_var,
        'audecrementl': cfg.long?.price_var,
        'autriggerl': cfg.long?.profit_percent,
        'aupricestep-l': cfg.long?.price_step_inc,
        
        'auamounts-usdt': cfg.short?.amountUsdt,
        'aupurchases-usdt': cfg.short?.purchaseUsdt,
        'auincrements': cfg.short?.size_var,
        'audecrements': cfg.short?.price_var,
        'autriggers': cfg.short?.profit_percent,
        'aupricestep-s': cfg.short?.price_step_inc
    };

    for (const [id, value] of Object.entries(mapping)) {
        const el = document.getElementById(id);
        if (el && value !== undefined && document.activeElement !== el) {
            el.value = value;
        }
    }

    const stopL = document.getElementById('au-stop-long-at-cycle');
    if (stopL && document.activeElement !== stopL) stopL.checked = !!cfg.long?.stopAtCycle;

    const stopS = document.getElementById('au-stop-short-at-cycle');
    if (stopS && document.activeElement !== stopS) stopS.checked = !!cfg.short?.stopAtCycle;
}

/**
 * Sincronización inmediata con el Backend (Auto-Save)
 */
async function syncConfigWithBackend() {
    const payload = {
        config: {
            symbol: TRADE_SYMBOL_TV || 'BTC_USDT',
            long: {
                amountUsdt: parseFloat(document.getElementById('auamountl-usdt')?.value) || 0,
                purchaseUsdt: parseFloat(document.getElementById('aupurchasel-usdt')?.value) || 0,
                stopAtCycle: document.getElementById('au-stop-long-at-cycle')?.checked || false,
                size_var: parseFloat(document.getElementById('auincrementl')?.value) || 0,
                price_var: parseFloat(document.getElementById('audecrementl')?.value) || 0,
                profit_percent: parseFloat(document.getElementById('autriggerl')?.value) || 0,
                price_step_inc: parseFloat(document.getElementById('aupricestep-l')?.value) || 0
            },
            short: {
                amountUsdt: parseFloat(document.getElementById('auamounts-usdt')?.value) || 0,
                purchaseUsdt: parseFloat(document.getElementById('aupurchases-usdt')?.value) || 0,
                stopAtCycle: document.getElementById('au-stop-short-at-cycle')?.checked || false,
                size_var: parseFloat(document.getElementById('auincrements')?.value) || 0,
                price_var: parseFloat(document.getElementById('audecrements')?.value) || 0,
                profit_percent: parseFloat(document.getElementById('autriggers')?.value) || 0,
                price_step_inc: parseFloat(document.getElementById('aupricestep-s')?.value) || 0
            }
        }
    };

    // Enviar por Socket para actualización en tiempo real
    if (socket && socket.connected) {
        socket.emit('update-bot-config', payload);
    }

    // Persistencia vía API para asegurar que se guarde en DB
    try {
        await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Error en auto-guardado:", err);
    }

    return payload.config;
}

function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'auamounts-usdt', 'aupurchasel-usdt', 'aupurchases-usdt', 
        'auincrementl', 'auincrements', 'audecrementl', 'audecrements', 
        'autriggerl', 'autriggers', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle',
        'aupricestep-l', 'aupricestep-s'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // "input" detecta cada tecla, "change" detecta cuando sales del campo
        el.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                logStatus("💾 Auto-guardando...", "info");
                await syncConfigWithBackend();
            }, 800); 
        });
    });
}

export async function initializeAutobotView(initialState) {
    const auOrderList = document.getElementById('au-order-list');
    
    // 1. Iniciamos los escuchadores de cambios
    setupConfigListeners();

    if (initialState) {
        updateAutobotInputs(initialState);
        updateControlsState(initialState);
    }

    // 2. Cargamos el gráfico
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // 3. Configuración de botones START/STOP
    const setupButtons = () => {
        const btnLong = document.getElementById('austartl-btn');
        const btnShort = document.getElementById('austarts-btn');

        if (btnLong && btnShort) {
            btnLong.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnLong.textContent.includes('STOP');
                logStatus(isRunning ? "🛑 Deteniendo Long..." : "🚀 Iniciando Long...");
                const currentConfig = await syncConfigWithBackend();
                await toggleBotSideState(isRunning, 'long', currentConfig);
            };

            btnShort.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnShort.textContent.includes('STOP');
                logStatus(isRunning ? "🛑 Deteniendo Short..." : "🚀 Iniciando Short...");
                const currentConfig = await syncConfigWithBackend();
                await toggleBotSideState(isRunning, 'short', currentConfig);
            };
            return true;
        }
        return false;
    };

    if (!setupButtons()) {
        const retry = setInterval(() => { if (setupButtons()) clearInterval(retry); }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // 4. Pestañas de órdenes
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            e.preventDefault();
            orderTabs.forEach(btn => btn.classList.remove('text-emerald-500', 'bg-gray-800'));
            tab.classList.add('text-emerald-500', 'bg-gray-800');
            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        };
    });

    if (socket && socket.connected) {
        socket.emit('get-bot-state'); 
    }
}