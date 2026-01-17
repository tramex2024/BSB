// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { displayMessage } from './uiManager.js';
import { toggleBotSideState } from './apiService.js'; 
import { socket, currentBotState, TRADE_SYMBOL_TV, logStatus } from '../main.js';

const MIN_USDT_AMOUNT = 6.00;
let currentTab = 'opened';

/**
 * Pinta los valores de la DB en los inputs de la UI de forma independiente
 */
export function updateAutobotInputs(state) {
    if (!state || !state.config) return;
    const cfg = state.config;

    // Sincronizar Long
    document.getElementById('auamountl-usdt') && (document.getElementById('auamountl-usdt').value = cfg.long?.amountUsdt || 0);
    document.getElementById('aupurchasel-usdt') && (document.getElementById('aupurchasel-usdt').value = cfg.long?.purchaseUsdt || 0);
    document.getElementById('auincrementl') && (document.getElementById('auincrementl').value = cfg.long?.size_var || 0);
    document.getElementById('audecrementl') && (document.getElementById('audecrementl').value = cfg.long?.price_var || 0);
    document.getElementById('autriggerl') && (document.getElementById('autriggerl').value = cfg.long?.trigger || 0);
    
    const stopL = document.getElementById('au-stop-long-at-cycle');
    if (stopL) stopL.checked = cfg.long?.stopAtCycle || false;

    // Sincronizar Short
    document.getElementById('auamounts-usdt') && (document.getElementById('auamounts-usdt').value = cfg.short?.amountUsdt || 0);
    document.getElementById('aupurchases-usdt') && (document.getElementById('aupurchases-usdt').value = cfg.short?.purchaseUsdt || 0);
    document.getElementById('auincrements') && (document.getElementById('auincrements').value = cfg.short?.size_var || 0);
    document.getElementById('audecrements') && (document.getElementById('audecrements').value = cfg.short?.price_var || 0);
    document.getElementById('autriggers') && (document.getElementById('autriggers').value = cfg.short?.trigger || 0);

    const stopS = document.getElementById('au-stop-short-at-cycle');
    if (stopS) stopS.checked = cfg.short?.stopAtCycle || false;
}

/**
 * Recolecta los valores de la UI y los envía al backend
 */
function syncConfigWithBackend() {
    if (!socket || !socket.connected) return;

    const payload = {
        config: {
            long: {
                amountUsdt: parseFloat(document.getElementById('auamountl-usdt')?.value) || 0,
                purchaseUsdt: parseFloat(document.getElementById('aupurchasel-usdt')?.value) || 0,
                stopAtCycle: document.getElementById('au-stop-long-at-cycle')?.checked || false,
                size_var: parseFloat(document.getElementById('auincrementl')?.value) || 0,
                price_var: parseFloat(document.getElementById('audecrementl')?.value) || 0,
                trigger: parseFloat(document.getElementById('autriggerl')?.value) || 0
            },
            short: {
                amountUsdt: parseFloat(document.getElementById('auamounts-usdt')?.value) || 0,
                purchaseUsdt: parseFloat(document.getElementById('aupurchases-usdt')?.value) || 0,
                stopAtCycle: document.getElementById('au-stop-short-at-cycle')?.checked || false,
                size_var: parseFloat(document.getElementById('auincrements')?.value) || 0,
                price_var: parseFloat(document.getElementById('audecrements')?.value) || 0,
                trigger: parseFloat(document.getElementById('autriggers')?.value) || 0
            }
        }
    };

    socket.emit('update-bot-config', payload);
}

function validateStrategyInputs() {
    const fields = ['auamountl-usdt', 'auamounts-usdt', 'aupurchasel-usdt', 'aupurchases-usdt'];
    let isValid = true;
    fields.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const val = parseFloat(input.value);
        if (isNaN(val) || val < MIN_USDT_AMOUNT) {
            input.classList.add('border-red-500');
            isValid = false;
        } else {
            input.classList.remove('border-red-500');
        }
    });
    return isValid;
}

function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'auamounts-usdt', 
        'aupurchasel-usdt', 'aupurchases-usdt', 
        'auincrementl', 'auincrements', 
        'audecrementl', 'audecrements', 
        'autriggerl', 'autriggers',
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        el.addEventListener('change', () => {
            syncConfigWithBackend();
        });
    });
}

export async function initializeAutobotView(initialState) {
    const auOrderList = document.getElementById('au-order-list');
    
    setupConfigListeners();

    if (initialState) {
        updateAutobotInputs(initialState);
    }

    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    const setupSeparateButtons = () => {
        const btnLong = document.getElementById('austartl-btn');
        const btnShort = document.getElementById('austarts-btn');

        if (btnLong && btnShort) {
            btnLong.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnLong.textContent.includes('STOP');
                if (!isRunning && !validateStrategyInputs()) {
                    displayMessage(`Monto mínimo ${MIN_USDT_AMOUNT} USDT`, "error");
                    return;
                }
                try {
                    logStatus(isRunning ? "🛑 Deteniendo Long..." : "🚀 Iniciando Long...");
                    await toggleBotSideState(isRunning, 'long');
                } catch (err) {
                    logStatus("❌ Error en operación Long", "error");
                }
            };

            btnShort.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnShort.textContent.includes('STOP');
                if (!isRunning && !validateStrategyInputs()) {
                    displayMessage(`Monto mínimo ${MIN_USDT_AMOUNT} USDT`, "error");
                    return;
                }
                try {
                    logStatus(isRunning ? "🛑 Deteniendo Short..." : "🚀 Iniciando Short...");
                    await toggleBotSideState(isRunning, 'short');
                } catch (err) {
                    logStatus("❌ Error en operación Short", "error");
                }
            };
            return true;
        }
        return false;
    };

    if (!setupSeparateButtons()) {
        const retry = setInterval(() => { if (setupSeparateButtons()) clearInterval(retry); }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            orderTabs.forEach(b => b.classList.remove('text-emerald-500', 'bg-gray-800'));
            tab.classList.add('text-emerald-500', 'bg-gray-800');
            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        };
    });

    if (socket && socket.connected) {
        socket.emit('get-bot-state'); 
    }
}