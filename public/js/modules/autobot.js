/**
 * autobot.js - Core Logic for Trading Tabs
 * Versión Purificada 2026: Solo Autobot (Long & Short)
 */

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
import { TRADE_SYMBOL_TV, currentBotState } from '../main.js';
import { socket } from './socket.js'; 
import { askConfirmation } from './confirmModal.js';
import { activeEdits } from './ui/controls.js';

const MIN_USDT_AMOUNT = 6.00;

let currentStrategyTab = 'all'; 
let configDebounceTimeout = null;

/**
 * Valida que los montos cumplan con el mínimo del exchange antes de iniciar
 */
function validateSideInputs(side) {
    const suffix = side === 'long' ? 'l' : 's';
    const fields = [`auamount${suffix}-usdt`, `aupurchase${suffix}-usdt`];
    let isValid = true;
    
    fields.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const val = parseFloat(input.value);
        if (isNaN(val) || val < MIN_USDT_AMOUNT) {
            input.classList.add('border-red-500', 'animate-shake');
            setTimeout(() => input.classList.remove('animate-shake'), 500);
            isValid = false;
        } else {
            input.classList.remove('border-red-500', 'animate-shake');
        }
    });
    return isValid;
}

/**
 * Escucha cambios en los inputs exclusivamente del Autobot
 */
function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventType = el.type === 'checkbox' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            // Marcamos edición activa para que el socket no interrumpa
            activeEdits[id] = Date.now();

            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                const val = el.type === 'checkbox' ? el.checked : el.value;

                // Si el campo está vacío y no es checkbox, no enviamos basura a la DB
                if (el.type !== 'checkbox' && (el.value === "" || isNaN(parseFloat(el.value)))) return;

                try {
                    // Sincronización inmediata con DB
                    await sendConfigToBackend();
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 800); 
        });
    });
}

/**
 * Inicializa la vista del Autobot
 */
export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    setupConfigListeners();

    /**
     * Lógica de botones Start/Stop (Long & Short únicamente)
     */
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const isRunning = (sideName === 'long' ? currentBotState.lstate !== 'STOPPED' : 
                             currentBotState.sstate !== 'STOPPED');
            
            if (isRunning) {
                const confirmed = await askConfirmation(sideName);
                if (!confirmed) return;
            } else {
                // Validamos montos mínimos SOLO al intentar iniciar
                if (!validateSideInputs(sideName)) {
                    displayMessage(`Min $${MIN_USDT_AMOUNT} USDT required for ${sideName.toUpperCase()}`, 'error');
                    return;
                }
            }

            try {
                newBtn.disabled = true;
                newBtn.textContent = isRunning ? "STOPPING..." : "STARTING...";
                await toggleBotSideState(isRunning, sideName);
            } catch (err) {
                displayMessage(`Error in ${sideName} engine`, 'error');
                updateControlsState(currentBotState); 
            } finally {
                newBtn.disabled = false;
            }
        });
    };

    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');

    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    const chartContainer = document.getElementById('au-tvchart');
    if (chartContainer) {
        setTimeout(() => {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }, 300);
    }

    if (auOrderList) {
        setupOrderTabs(auOrderList);
    }
}

function setupOrderTabs(container) {
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    if (!orderTabs.length || !container) return;

    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-500', 'bg-gray-800');
            btn.classList.add('text-gray-500');
            if (btn.id === selectedId) {
                btn.classList.remove('text-gray-500');
                btn.classList.add('text-emerald-500', 'bg-gray-800');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            const btn = e.currentTarget;
            const strategy = btn.getAttribute('data-strategy');
            setActiveTabStyle(btn.id);
            currentStrategyTab = strategy;
            fetchOrders(strategy, container);
        };
    });

    setActiveTabStyle('tab-all-strategies');
    fetchOrders('all', container);
}