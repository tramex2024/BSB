/**
 * autobot.js - Core Logic for Trading Tabs
 * Versión Purificada y Blindada 2026: Solo Autobot (Long & Short) con saneamiento integral de listeners
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
 * Escucha cambios en los inputs exclusivamente del Autobot de forma segura
 * Con Actualización Optimista Inmediata y Blindaje [V2.1 - 2026]
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
        
        const handler = () => {
            activeEdits[id] = Date.now();

            // 1. OBTENCIÓN Y VALIDACIÓN ATÓMICA
            const rawValue = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
            
            // Si es un input numérico y no es un número válido (ej: está vacío o tiene caracteres raros), no hacemos nada.
            // Esto evita que NaN entre en el sistema.
            if (el.type !== 'checkbox' && isNaN(rawValue)) return;

            // Identificación atómica del lado (Long / Short)
            const side = id.includes('l') ? 'long' : 'short';
            const s = side === 'long' ? 'l' : 's';

            // 2. MUTACIÓN PROTEGIDA (Solo si rawValue es seguro)
            if (!currentBotState.config) currentBotState.config = {};
            if (!currentBotState.config[side]) currentBotState.config[side] = {};

            // Mapeo seguro
            if (id.includes('amount')) currentBotState.config[side].amountUsdt = rawValue;
            else if (id.includes('purchase')) currentBotState.config[side].purchaseUsdt = rawValue;
            else if (id.includes('trigger')) currentBotState.config[side].price_var = rawValue;
            else if (id.includes('increment')) currentBotState.config[side].size_var = rawValue;
            else if (id.includes('decrement')) currentBotState.config[side].profit_percent = rawValue;
            else if (id.includes('pricestep')) currentBotState.config[side].price_step_inc = rawValue;
            else if (id.includes('stop')) currentBotState.config[side].stopAtCycle = rawValue;

            // 3. DEBOUNCE CONTROLADO
            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                // Validación final: extraemos del DOM solo valores numéricos válidos
                const getVal = (selector, fallback) => {
                    const el = document.getElementById(selector);
                    const val = parseFloat(el?.value);
                    return isNaN(val) ? fallback : val;
                };

                const amountUsdt = getVal(`auamount${s}-usdt`, currentBotState.config[side]?.amountUsdt || 0);
                const purchaseUsdt = getVal(`aupurchase${s}-usdt`, currentBotState.config[side]?.purchaseUsdt || 0);
                const price_var = getVal(`autrigger${s}`, currentBotState.config[side]?.price_var || 0);
                const size_var = getVal(`auincrement${s}`, currentBotState.config[side]?.size_var || 0);
                const profit_percent = getVal(`audecrement${s}`, currentBotState.config[side]?.profit_percent || 0);
                const price_step_inc = getVal(`aupricestep-${s}`, currentBotState.config[side]?.price_step_inc || 0);
                const stopAtCycle = document.getElementById(`au-stop-${side}-at-cycle`)?.checked || false;

                const manualConfig = {
                    ...currentBotState.config,
                    [side]: { amountUsdt, purchaseUsdt, price_var, size_var, profit_percent, price_step_inc, stopAtCycle }
                };

                try {
                    const result = await sendConfigToBackend({
                        config: manualConfig, 
                        strategy: side,
                        applyShield: true 
                    });

                    if (result?.success && result.data) {
                        currentBotState.config = result.data;
                        updateControlsState(currentBotState);
                    }
                } catch (err) {
                    console.error(`❌ Error sincronizando [${side}]:`, err);
                }
            }, 1000);
        };

        if (el.type === 'checkbox') el.onchange = handler;
        else el.oninput = handler;
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    setupConfigListeners();
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    const chartContainer = document.getElementById('au-tvchart');
    if (chartContainer) {
        setTimeout(() => {
            if (window.currentChart) {
                try { window.currentChart.remove(); window.currentChart = null; } 
                catch(e) { console.warn("Chart removal mitigation:", e); }
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }, 300);
    }

    if (auOrderList) setupOrderTabs(auOrderList);
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
            const strategy = btn.getAttribute('data-strategy') || 'all';
            setActiveTabStyle(btn.id);
            currentStrategyTab = strategy;
            fetchOrders(strategy, container);
        };
    });

    setActiveTabStyle('tab-all-strategies');
    fetchOrders('all', container);
}