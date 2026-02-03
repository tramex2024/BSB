// public/js/modules/autobot.js

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
 * Escucha cambios en todos los inputs de configuración (Dashboard + Tabs)
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
                // Evitar ceros accidentales si el campo está vacío al escribir
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
     * Configura el evento de Start/Stop para un botón y su lógica asociada
     */
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // Limpieza de eventos previos
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Determinar si está corriendo por clases o estado global
            const isRunning = newBtn.classList.contains('bg-red-600') || 
                            (sideName === 'long' ? currentBotState.lstate !== 'STOPPED' : 
                             sideName === 'short' ? currentBotState.sstate !== 'STOPPED' : 
                             currentBotState.isRunning);
            
            if (isRunning) {
                const confirmed = await askConfirmation(sideName);
                if (!confirmed) return;
            } else {
                // Validar solo si vamos a encender
                if (sideName !== 'ai' && !validateSideInputs(sideName)) {
                    displayMessage(`Mínimo $${MIN_USDT_AMOUNT} USDT para ${sideName.toUpperCase()}`, 'error');
                    return;
                }
            }

            try {
                newBtn.disabled = true;
                newBtn.textContent = isRunning ? "Stopping..." : "Starting...";
                await toggleBotSideState(isRunning, sideName);
            } catch (err) {
                displayMessage(`Error en ${sideName}`, 'error');
                updateControlsState(currentBotState); 
            } finally {
                newBtn.disabled = false;
            }
        });
    };

    // Inicializar botones de las Tabs y del Dashboard
    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai'); // Dashboard
    setupSideBtn('btn-start-ai', 'ai');    // Pestaña IA

    // Sincronización de UI inicial
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    // Inicializar Gráfico de TradingView
    setTimeout(() => {
        const chartContainer = document.getElementById('au-tvchart');
        if (chartContainer) {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 500);

    // Lógica de Tabs para historial de órdenes
    setupOrderTabs(auOrderList);
}

function setupOrderTabs(container) {
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    if (!orderTabs.length) return;

    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-400', 'font-bold', 'border-emerald-500/30');
            btn.classList.add('bg-gray-800/40', 'text-gray-500');
            if (btn.id === selectedId) {
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            currentTab = selectedId.replace('tab-', '');
            fetchOrders(currentTab, container);
        };
    });

    setActiveTabStyle('tab-all');
    fetchOrders('all', container);
}