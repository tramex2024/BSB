/**
 * main.js - Central Hub
 * AI Core English Version 2026
 */
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';
import { initSocket } from './modules/socket.js'; 
import { fetchOrders } from './modules/orders.js'; 

// --- CONFIGURATION ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

// Fuente única de verdad para toda la aplicación
export const currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aibalance: 0,
    isRunning: false,
    stopAtCycle: false,
    config: {
        symbol: 'BTC_USDT', 
        long: { amountUsdt: 0, enabled: false },
        short: { amountUsdt: 0, enabled: false },
        ai: { amountUsdt: 0, enabled: false, stopAtCycle: false }
    }
};

export let intervals = {}; 

let logQueue = [];
let isProcessingLog = false;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- LOG SYSTEM (Global) ---
export function logStatus(message, type = 'info') {
    if (type === 'error') logQueue = [{ message, type }]; 
    else {
        if (logQueue.length >= 2) logQueue.shift();
        logQueue.push({ message, type });
    }
    if (!isProcessingLog) processNextLog();
}

function processNextLog() {
    if (logQueue.length === 0) { isProcessingLog = false; return; }
    const logEl = document.getElementById('log-message');
    if (!logEl) return;

    isProcessingLog = true;
    const log = logQueue.shift();
    logEl.textContent = log.message;
    
    const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
    logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
    
    setTimeout(() => processNextLog(), 2500);
}

// --- APP INITIALIZATION ---
export function initializeFullApp() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    if (token && userId) {
        console.log("🚀 Initializing Authenticated App Flow...");
        initSocket();
    } else {
        console.warn("⚠️ Partial session detected. Waiting for full login.");
    }
}

// --- TAB MANAGEMENT ---
export async function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        mainContent.innerHTML = await response.text();
        
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            const initFn = module[initFnName];
            
            if (initFn) {
                await initFn(currentBotState);
                if (tabName === 'dashboard' && module.updateDistributionWidget) {
                    module.updateDistributionWidget(currentBotState);
                }
            }

            if (tabName === 'aibot') {
                const aiOrderList = document.getElementById('ai-order-list');
                if (aiOrderList) {
                    fetchOrders('ai', aiOrderList);
                } else {
                    const aiHistoryCont = document.getElementById('ai-history-table-body');
                    if (aiHistoryCont) fetchOrders('ai', aiHistoryCont);
                }
            }
            
            if (tabName === 'autobot') {
                const auOrderList = document.getElementById('au-order-list');
                if (auOrderList) fetchOrders('all', auOrderList);
            }
        }

        syncAIElementsInDOM();

    } catch (error) { 
        console.error("❌ View Loading Error:", error); 
    }
}

function syncAIElementsInDOM() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) aiInput.value = currentBotState.config.ai.amountUsdt || "";
    if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle;
    
    aiBotUI.setRunningStatus(
        currentBotState.isRunning, 
        currentBotState.stopAtCycle || currentBotState.config.ai.stopAtCycle,
        currentBotState.historyCount || 0
    );
}

// --- GLOBAL EVENT DELEGATION (CORREGIDO) ---
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'btn-start-ai') {
        // COMENTADO PARA EVITAR CONFLICTO CON aibot.js / autobot.js
        // console.log("Clic detectado en main.js - Ignorado para evitar duplicidad.");
        return; 
        
        /* Se deja el bloque original por si necesitas revertir, 
           pero el "return" arriba evita que se ejecute la doble petición.
        */
        /*
        const btnAi = e.target;
        const isCurrentlyEnabled = currentBotState.isRunning;
        const action = isCurrentlyEnabled ? 'stop' : 'start';
        // ... (resto del código original)
        */
    }
});

// --- INITIAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    const hasToken = localStorage.getItem('token');
    const hasUserId = localStorage.getItem('userId');

    if (hasToken && hasUserId) { 
        initializeFullApp(); 
    } else {
        logStatus("Please sign in to access bot controls.", "warning");
    }

    setupNavTabs(initializeTab); 
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    initializeTab('dashboard'); 
});