import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState, renderAutobotOrders } from './modules/uiManager.js'; 
import { initSocket } from './modules/socket.js';
import './modules/orderActions.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aibalance: 0,
    lastAvailableUSDT: 0,
    openOrders: [],
    ordersHistory: [],
    config: {
        symbol: 'BTCUSDT',
        long: { amountUsdt: 0, enabled: false },
        short: { amountUsdt: 0, enabled: false },
        ai: { amountUsdt: 0, enabled: false, stopAtCycle: false }
    }
};

let logQueue = [];
let isProcessingLog = false;

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

export async function initializeTab(tabName) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        mainContent.innerHTML = await response.text();
        
        // Modules requiring setup after DOM injection
        if (tabName === 'autobot') {
            const { setupOrderTabs } = await import('./modules/appEvents.js');
            setupOrderTabs();
            renderAutobotOrders(currentBotState.openOrders, 'opened');
            renderAutobotOrders(currentBotState.ordersHistory, 'all');
            renderAutobotOrders(currentBotState.ordersHistory.filter(o => o.status === 'FILLED'), 'filled');
            renderAutobotOrders(currentBotState.ordersHistory.filter(o => o.status.includes('CANCE')), 'cancelled');
        } 

        // Dynamic View Initialization
        const module = await import(`./modules/${tabName}.js`);
        const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
        if (module[initFnName]) await module[initFnName](currentBotState);

    } catch (error) { console.error(`❌ Error loading ${tabName}:`, error); }
}

document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab); 
    initializeAppEvents(initSocket);
    updateLoginIcon();
    if (localStorage.getItem('token')) initSocket();
    initializeTab(window.location.hash.replace('#', '') || 'dashboard');
});