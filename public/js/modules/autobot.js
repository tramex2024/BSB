// public/js/modules/autobot.js

// public/js/modules/autobot.js

/**
 * autobot.js - Core Logic for Trading Tabs
 * Integration: WebSocket Sync & Client-Side Filtering 2026
 */

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
import { TRADE_SYMBOL_TV, currentBotState } from '../main.js';
import { askConfirmation } from './confirmModal.js';
import { activeEdits } from './ui/controls.js';

const MIN_USDT_AMOUNT = 6.00;
let currentTab = 'all';
let configDebounceTimeout = null;

/**
 * Valida que los montos cumplan con el mínimo del exchange
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
            isValid = false;
        } else {
            input.classList.remove('border-red-500', 'animate-shake');
        }
    });
    return isValid;
}

/**
 * Escucha cambios en todos los inputs de configuración
 */
function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'auamountai-usdt', 'ai-amount-usdt', 
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle', 
        'au-stop-ai-at-cycle', 'ai-stop-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventType = el.type === 'checkbox' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            activeEdits[id] = Date.now();

            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            configDebounceTimeout = setTimeout(async () => {
                if (el.type !== 'checkbox' && (el.value === "" || isNaN(parseFloat(el.value)))) return;

                try {
                    await sendConfigToBackend();
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 800); 
        });
    });
}

/**
 * Inicializa la vista y sincroniza los botones espejo
 */
export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    setupConfigListeners();

    /**
     * Configura el evento de Start/Stop para un botón
     */
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const isRunning = (sideName === 'long' ? currentBotState.lstate !== 'STOPPED' : 
                             sideName === 'short' ? currentBotState.sstate !== 'STOPPED' : 
                             currentBotState.config.ai.enabled);
            
            if (isRunning) {
                const confirmed = await askConfirmation(sideName);
                if (!confirmed) return;
            } else {
                if (sideName !== 'ai' && !validateSideInputs(sideName)) {
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
    setupSideBtn('austartai-btn', 'ai'); 
    setupSideBtn('btn-start-ai', 'ai');

    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    setTimeout(() => {
        const chartContainer = document.getElementById('au-tvchart');
        if (chartContainer) {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 300);

    setupOrderTabs(auOrderList);
}

/**
 * Configura la navegación de pestañas con filtrado local (vía Sockets)
 */
function setupOrderTabs(container) {
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    if (!orderTabs.length || !container) return;

    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-400', 'font-bold', 'border-b-2', 'border-emerald-500');
            btn.classList.add('text-gray-500');
            if (btn.id === selectedId) {
                btn.classList.remove('text-gray-500');
                btn.classList.add('text-emerald-400', 'font-bold', 'border-b-2', 'border-emerald-500');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            
            // Extraer el nombre de la pestaña (all, filled, cancelled, opened)
            currentTab = selectedId.replace('tab-', '');
            
            // Llamada a la nueva lógica de filtrado local en orders.js
            fetchOrders(currentTab, container);
        };
    });

    // Carga inicial: No hace fetch, simplemente renderiza lo que ya hay en currentBotState.ordersHistory
    setActiveTabStyle('tab-all');
    fetchOrders('all', container);
}