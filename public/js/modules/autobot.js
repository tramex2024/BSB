/**
 * public/js/modules/autobot.js
 * Gestión de la vista del Autobot con Sincronización de Estados.
 */

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { displayMessage, updateControlsState } from './uiManager.js';
import { toggleBotSideState } from './apiService.js'; 
import { socket, currentBotState, TRADE_SYMBOL_TV, logStatus } from '../main.js';

const MIN_USDT_AMOUNT = 6.00;
let currentTab = 'opened';

/**
 * Pinta los valores de la DB en los inputs de la UI de forma independiente.
 */
export function updateAutobotInputs(state) {
    if (!state || !state.config) return;
    const cfg = state.config;

    const mapping = {
        // LONG
        'auamountl-usdt': cfg.long?.amountUsdt,
        'aupurchasel-usdt': cfg.long?.purchaseUsdt,
        'auincrementl': cfg.long?.size_var,
        'audecrementl': cfg.long?.price_var,
        'autriggerl': cfg.long?.profit_percent,
        'aupricestep-l': cfg.long?.price_step_inc,
        
        // SHORT
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

    // Checkboxes de Stop at Cycle
    const stopL = document.getElementById('au-stop-long-at-cycle');
    if (stopL && document.activeElement !== stopL) stopL.checked = !!cfg.long?.stopAtCycle;

    const stopS = document.getElementById('au-stop-short-at-cycle');
    if (stopS && document.activeElement !== stopS) stopS.checked = !!cfg.short?.stopAtCycle;
}

/**
 * Recolecta los valores de la UI y los envía al backend vía Socket.
 * ✅ Sincronizado con nombres de siglas 2026
 */
function syncConfigWithBackend() {
    if (!socket || !socket.connected) return;

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

    socket.emit('update-bot-config', payload);
    return payload.config; // Lo devolvemos para usarlo en el fetch si es necesario
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
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle',
        'aupricestep-l', 'aupricestep-s'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            syncConfigWithBackend();
        });
    });
}

/**
 * Inicialización de la Vista de Autobot
 */
export async function initializeAutobotView(initialState) {
    const auOrderList = document.getElementById('au-order-list');
    setupConfigListeners();

    if (initialState) {
        updateAutobotInputs(initialState);
        updateControlsState(initialState);
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
                    // Capturamos config actual para enviarla en el arranque
                    const currentConfig = syncConfigWithBackend();
                    const res = await toggleBotSideState(isRunning, 'long', currentConfig);
                    
                    if (res && res.success) {
                        displayMessage(res.message, "success");
                    } else {
                        throw new Error(res.message || "Error en el servidor");
                    }
                } catch (err) {
                    logStatus("❌ Error en operación Long", "error");
                    console.error(err);
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
                    const currentConfig = syncConfigWithBackend();
                    const res = await toggleBotSideState(isRunning, 'short', currentConfig);
                    
                    if (res && res.success) {
                        displayMessage(res.message, "success");
                    } else {
                        throw new Error(res.message || "Error en el servidor");
                    }
                } catch (err) {
                    logStatus("❌ Error en operación Short", "error");
                    console.error(err);
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

    // --- Lógica de Pestañas ---
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            e.preventDefault();
            orderTabs.forEach(btn => {
                btn.classList.remove('text-emerald-500', 'bg-gray-800');
                btn.classList.add('text-gray-500', 'hover:text-white');
            });
            tab.classList.remove('text-gray-500', 'hover:text-white');
            tab.classList.add('text-emerald-500', 'bg-gray-800');
            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        };
    });

    if (socket && socket.connected) {
        socket.emit('get-bot-state'); 
    }
}