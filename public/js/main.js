/**
 * main.js - Central Hub (Pro-Sync 2026)
 * Estado: Auditado, Blindado (Race Conditions, Rollback Automático, UI Declarativa)
 */
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';
import { initSocket } from './modules/socket.js'; 
import { fetchOrders } from './modules/orders.js'; 

import { initializeSupport } from './modules/support.js';
import { updateSystemHealth } from './modules/health.js';
import { initializeSettings } from './modules/settings.js';
import { initializeProfile } from './modules/profile.js';
import { initPayments } from './modules/payments.js';

import { initializeGlobalButtonListeners } from './modules/botControls.js';
import { applyRolePermissions } from './modules/role.js';
import { sendConfigToBackend, getBotConfiguration } from './modules/apiService.js';
import { setupBotInput } from './modules/ui/controls.js';

// --- CONFIGURATION ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0, lastPrice: 0,
    lstate: 'STOPPED', sstate: 'STOPPED', aistate: 'STOPPED',
    aibalance: 0, isRunning: false, stopAtCycle: false,
    historyCount: 0, lastAvailableUSDT: 0, lastAvailableBTC: 0,
    lprofit: 0, sprofit: 0, aiprofit: 0,
    config: {
        symbol: 'BTC_USDT', 
        long: { amountUsdt: 0, purchaseUsdt: 0, price_var: 0.1, profit_percent: 0.1, size_var: 1, price_step_inc: 0, enabled: false, stopAtCycle: false },
        short: { amountUsdt: 0, purchaseUsdt: 0, price_var: 0.1, profit_percent: 0.1, size_var: 1, price_step_inc: 0, enabled: false, stopAtCycle: false },
        ai: { amountUsdt: 0, enabled: false, stopAtCycle: false }
    }
};

export let intervals = {}; 
let logQueue = [];
let isProcessingLog = false;
let isNavigating = false; // [BLINDAJE]: Lock de navegación

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js'),
    admin: () => import('./modules/admin.js')
};

// --- LOG SYSTEM ---
export function logStatus(message, type = 'info') {
    if (type === 'error') logQueue = [{ message, type }]; 
    else {
        if (logQueue.length >= 3) logQueue.shift();
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
    setTimeout(() => processNextLog(), 1500);
}

// --- APP INITIALIZATION ---
export function initializeFullApp() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole'); 

    if (token && userId) {
        const adminTab = document.getElementById('tab-admin');
        if (adminTab && userRole === 'admin') {
            adminTab.style.display = 'block';
            adminTab.classList.remove('hidden');
        }
        applyRolePermissions();
        const socket = initSocket();
        if (socket) {
            import('./modules/notifications.js').then(module => {
                module.initializeNotifications(socket);
            }).catch(err => console.error("❌ Error notifications:", err));
        }
    }
}

// --- TAB MANAGEMENT ---
export async function initializeTab(tabName) {
    if (isNavigating) return; 
    isNavigating = true;
    
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    const mainContent = document.getElementById('main-content');
    if (!mainContent) { isNavigating = false; return; }

    try {
        const response = await fetch(`./${tabName}.html`);
        const html = await response.text();
        
        if (mainContent.innerHTML !== html) {
            mainContent.innerHTML = html;
            bindLocksForView(tabName); 
        }
        
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
                if (aiOrderList) fetchOrders('ai', aiOrderList);
            }
            if (tabName === 'autobot') {
                const auOrderList = document.getElementById('au-order-list');
                if (auOrderList) fetchOrders('all', auOrderList);
            }
        }
        await updateBotUI(currentBotState);
        syncAIElementsInDOM();
    } catch (error) { 
        console.error("❌ View Loading Error:", error); 
    } finally {
        isNavigating = false;
    }
}

function bindLocksForView(tabName) {
    if (tabName === 'autobot') {
        ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l']
            .forEach(id => setupBotInput(id, 'long', false));
        ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s']
            .forEach(id => setupBotInput(id, 'short', false));
    } else if (tabName === 'aibot') {
        ['auamountai-usdt', 'ai-amount-usdt']
            .forEach(id => setupBotInput(id, 'ai', false));
    }
}

function syncAIElementsInDOM() {
    // [BLINDAJE]: Sincronización declarativa
    const mapping = {
        'ai-amount-usdt': currentBotState.config.ai.amountUsdt,
        'ai-stop-at-cycle': currentBotState.config.ai.stopAtCycle
    };

    Object.entries(mapping).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value || "";
    });

    if (aiBotUI) {
        aiBotUI.setRunningStatus(
            currentBotState.aistate === 'RUNNING', 
            currentBotState.config.ai.stopAtCycle, 
            currentBotState.historyCount || 0
        );
    }
}

// --- CONFIGURATION DELEGATION ---
document.addEventListener('change', async (e) => {
    if (!e.target) return;

    // Manejo de Checkboxes LONG / SHORT con Rollback
    if (e.target.id === 'au-stop-long-at-cycle' || e.target.id === 'au-stop-short-at-cycle') {
        const side = e.target.id.includes('long') ? 'long' : 'short';
        const isChecked = e.target.checked;
        const previousValue = !isChecked;

        logStatus(`${side.toUpperCase()}: STOP AT CYCLE -> ${isChecked ? 'ON' : 'OFF'}`, "info");
        
        if (!currentBotState.config[side]) currentBotState.config[side] = {};
        currentBotState.config[side].stopAtCycle = isChecked;

        try {
            // AQUÍ ES DONDE COLOCAS EL CÓDIGO. 
            // Lo envolvemos en { config: ... } para asegurar que el backend reciba el formato correcto.
            await sendConfigToBackend({ config: currentBotState.config });
        } catch (err) {
            currentBotState.config[side].stopAtCycle = previousValue;
            e.target.checked = previousValue;
            logStatus(`Error: Cambio no guardado. Revirtiendo ${side.toUpperCase()}...`, "error");
        }
    }
});

// --- INITIAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('welcome-splash');
    const closeSplash = document.getElementById('close-splash');

    if (sessionStorage.getItem('splash-hidden') === 'true') {
        if (splash) splash.remove();
    } else {
        closeSplash?.addEventListener('click', () => {
            splash.classList.add('opacity-0', 'transition-opacity', 'duration-500');
            setTimeout(() => splash.remove(), 500);
            sessionStorage.setItem('splash-hidden', 'true');
        });
    }

    applyRolePermissions();
    initializeGlobalButtonListeners();

    if (localStorage.getItem('token') && localStorage.getItem('userId')) { 
        initializeFullApp(); 
    } else {
        logStatus("Please sign in to access bot controls.", "warning");
    }

    setupNavTabs(initializeTab); 
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    initializeTab('dashboard'); 
    
    initializeSupport();
    initializeSettings();
    initializeProfile();
    initPayments();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        import('./modules/socket.js').then(m => {
            if (!m.socket || !m.socket.connected) m.initSocket();
            else m.socket.emit('get-bot-state');
        });
    }
});