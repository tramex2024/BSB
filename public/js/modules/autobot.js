/**
 * autobot.js - Core Logic for Trading Tabs
 * Integration: Strategy-based Filtering 2026 - FULL VERSION
 * Actualización: Validación preventiva de montos técnicos y semáforo de edición
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
const MIN_TECH_VALUE = 0.1; // Protección para price_var, size_var, etc.

let currentStrategyTab = 'all'; 
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
            setTimeout(() => input.classList.remove('animate-shake'), 500);
            isValid = false;
        } else {
            input.classList.remove('border-red-500', 'animate-shake');
        }
    });
    return isValid;
}

/**
 * Escucha cambios en los inputs (Dashboard + Tabs)
 * REINTEGRADO: Con validación de seguridad contra ceros accidentales
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
            // Marcamos que este input está bajo edición activa
            activeEdits[id] = Date.now();

            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                const val = parseFloat(el.value);

                // 🛡️ PROTECCIÓN CRÍTICA: 
                // Si no es un checkbox y el valor es basura, 0 o menor al mínimo técnico, abortamos el envío
                if (el.type !== 'checkbox') {
                    if (el.value === "" || isNaN(val)) return;
                    
                    // Si es un campo de configuración técnica (steps, vars, increments) y es < 0.1
                    if (!id.includes('amount') && !id.includes('purchase') && val < MIN_TECH_VALUE) {
                        console.warn(`⚠️ Valor demasiado bajo para ${id}, no se enviará.`);
                        return;
                    }
                }

                try {
                    // El apiService ahora usará el semáforo para bloquear al socket
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
     * Lógica de botones Start/Stop
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