/**
 * main.js - Central Hub (Pro-Sync 2026)
 * Estado: Corregido - Sincronización real de checkboxes Long/Short
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
import { initializeNotifications } from './modules/notifications.js';

import { initializeGlobalButtonListeners } from './modules/botControls.js';
import { displayMessage } from './modules/ui/notifications.js';
import { applyRolePermissions } from './modules/role.js';

// Importamos el servicio de API para poder guardar los cambios de los checkboxes
import { sendConfigToBackend, getBotConfiguration } from './modules/apiService.js';

// --- CONFIGURATION ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0,
    lastPrice: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aistate: 'STOPPED',
    aibalance: 0,
    isRunning: false,
    stopAtCycle: false,
    historyCount: 0,
    lastAvailableUSDT: 0,
    lastAvailableBTC: 0,
    lprofit: 0,
    sprofit: 0,
    aiprofit: 0,
    config: {
        symbol: 'BTC_USDT', 
        long: { amountUsdt: 0, enabled: false, stopAtCycle: false },
        short: { amountUsdt: 0, enabled: false, stopAtCycle: false },
        ai: { amountUsdt: 0, enabled: false, stopAtCycle: false }
    }
};

export let intervals = {}; 

let logQueue = [];
let isProcessingLog = false;

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
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        const html = await response.text();
        if (mainContent.innerHTML !== html) mainContent.innerHTML = html;
        
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
    } catch (error) { console.error("❌ View Loading Error:", error); }
}

function syncAIElementsInDOM() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');
    if (aiInput) aiInput.value = currentBotState.config.ai.amountUsdt || "";
    if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle;
    if (aiBotUI) {
        aiBotUI.setRunningStatus(currentBotState.aistate === 'RUNNING', currentBotState.config.ai.stopAtCycle, currentBotState.historyCount || 0);
    }
}

// --- CONFIGURATION DELEGATION (CHECKBOXES FIX) ---
document.addEventListener('change', async (e) => {
    // 1. Manejo de Input de cantidad AI
    if (e.target && e.target.id === 'ai-amount-usdt') {
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) return;
        await saveAIConfigGlobal({ amountUsdt: val });
    }
    
    // 2. Manejo de Checkbox AI
    if (e.target && e.target.id === 'ai-stop-at-cycle') {
        await saveAIConfigGlobal({ stopAtCycle: e.target.checked });
    }

    // 3. [FIX] Manejo de Checkboxes LONG / SHORT (Dashboard y Autobot)
    if (e.target && (e.target.id === 'au-stop-long-at-cycle' || e.target.id === 'au-stop-short-at-cycle')) {
        const side = e.target.id.includes('long') ? 'long' : 'short';
        const isChecked = e.target.checked;
        
        logStatus(`${side.toUpperCase()}: STOP AT CYCLE -> ${isChecked ? 'ON' : 'OFF'}`, "info");
        
        // Actualizamos el estado local inmediatamente
        currentBotState.config[side].stopAtCycle = isChecked;

        // Enviamos la configuración completa al servidor
        const fullConfig = getBotConfiguration();
        await sendConfigToBackend({ config: fullConfig });
    }
});

async function saveAIConfigGlobal(payload) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success && data.config) {
            currentBotState.config.ai = { ...currentBotState.config.ai, ...data.config };
            logStatus(data.message || "AI Config Updated", "success");
        }
    } catch (e) { console.error("Error saving AI config", e); }
}

// --- INITIAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
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
        const activeTab = document.querySelector('.nav-link.active')?.dataset.tab;
        if (activeTab) initializeTab(activeTab); 
    }
});