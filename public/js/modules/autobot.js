/**
 * autobot.js - Core Logic for Trading Tabs
 * Versión Purificada 2026: Solo Autobot (Long & Short)
 */
import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState } from './uiManager.js';
import { sendConfigToBackend } from './apiService.js'; 
import { TRADE_SYMBOL_TV, currentBotState } from '../main.js';
import { activeEdits } from './ui/controls.js';

const MIN_USDT_AMOUNT = 6.00;
let currentStrategyTab = 'all'; 
let configDebounceTimeout = null;

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
            activeEdits[id] = Date.now();

            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                if (el.type !== 'checkbox' && (el.value === "" || isNaN(parseFloat(el.value)))) return;

                let side = id.includes('l') ? 'long' : 'short';
                const s = side === 'long' ? 'l' : 's';

                const manualConfig = {
                    [side]: {
                        amountUsdt: parseFloat(document.getElementById(`auamount${s}-usdt`)?.value),
                        purchaseUsdt: parseFloat(document.getElementById(`aupurchase${s}-usdt`)?.value),
                        price_var: parseFloat(document.getElementById(`autrigger${s}`)?.value),
                        size_var: parseFloat(document.getElementById(`auincrement${s}`)?.value),
                        profit_percent: parseFloat(document.getElementById(`audecrement${s}`)?.value),
                        price_step_inc: parseFloat(document.getElementById(`aupricestep-${s}`)?.value),
                        stopAtCycle: document.getElementById(`au-stop-${side}-at-cycle`)?.checked
                    }
                };

                try {
                    const result = await sendConfigToBackend({
                        config: manualConfig, 
                        strategy: side,
                        applyShield: false
                    });

                    if (result && result.success && result.data) {
                        currentBotState.config = result.data;
                    }
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 1000);
        });
    });
}

/**
 * Inicializa la vista del Autobot
 */
export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    // Activamos los escuchadores de cambios en inputs
    setupConfigListeners();

    // Sincronizamos la UI con el estado global
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    // Inicializamos el gráfico
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