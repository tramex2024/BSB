/**
 * main.js - Central Hub (Pro-Sync 2026)
 * Estado: Auditado y Blindado contra condiciones de carrera y re-renderizados destructivos
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
    if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle || false;
    if (aiBotUI) {
        aiBotUI.setRunningStatus(currentBotState.aistate === 'RUNNING', currentBotState.config.ai.stopAtCycle, currentBotState.historyCount || 0);
    }
}

// --- CONFIGURATION DELEGATION ---
document.addEventListener('change', async (e) => {
    if (!e.target) return;

    // [BLINDAJE 2026]: Los inputs de la IA ('ai-amount-usdt' y 'ai-stop-at-cycle') ya se gestionan 
    // de forma atómica dentro de su propio ciclo en aiBot.js. Se eliminan de aquí para prevenir peticiones dobles.

    // Manejo de Checkboxes LONG / SHORT (Dashboard y Autobot de forma delegada global)
    if (e.target.id === 'au-stop-long-at-cycle' || e.target.id === 'au-stop-short-at-cycle') {
        const side = e.target.id.includes('long') ? 'long' : 'short';
        const isChecked = e.target.checked;
        
        logStatus(`${side.toUpperCase()}: STOP AT CYCLE -> ${isChecked ? 'ON' : 'OFF'}`, "info");
        
        // Actualizamos el estado local inmediatamente para evitar discrepancias visuales
        if (!currentBotState.config[side]) currentBotState.config[side] = {};
        currentBotState.config[side].stopAtCycle = isChecked;

        // Enviamos la configuración completa al servidor de forma segura
        const fullConfig = getBotConfiguration();
        await sendConfigToBackend({ config: fullConfig });
    }
});

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
            if (!m.socket || !m.socket.connected) {
                m.initSocket();
            } else {
                // Al recuperar foco, solicitamos el estado en caliente de forma sutil vía WebSocket
                m.socket.emit('get-bot-state');
            }
        });
        
        // [BLINDAJE]: Quitamos el re-fetch destructivo de 'initializeTab' para evitar parpadeos visuales 
        // agresivos si el WebSocket ya se encuentra listo para inyectar los datos en tiempo real.
    }
});