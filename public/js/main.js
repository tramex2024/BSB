/**
 * main.js - Central Hub
 * AI Core English Version 2026
 * Unified Global Control Logic
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
    aistate: 'STOPPED', // Fuente de verdad para el motor neural
    aibalance: 0,
    isRunning: false,
    stopAtCycle: false,
    historyCount: 0,
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
    
    // Suavizado de 1.2s para mayor dinamismo
    setTimeout(() => processNextLog(), 1200);
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
        const html = await response.text();
        
        // Prevención de parpadeo: solo inyectar si el contenido cambia
        if (mainContent.innerHTML !== html) {
            mainContent.innerHTML = html;
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
    
    const isAiRunning = currentBotState.aistate === 'RUNNING';

    aiBotUI.setRunningStatus(
        isAiRunning, 
        currentBotState.config.ai.stopAtCycle,
        currentBotState.historyCount || 0
    );
}

// --- GLOBAL EVENT DELEGATION (Lógica Centralizada de IA) ---
document.addEventListener('click', async (e) => {
    const btnAi = e.target.closest('#btn-start-ai');
    if (btnAi) {
        if (btnAi.disabled) return;

        const isCurrentlyEnabled = currentBotState.aistate === 'RUNNING';
        const action = isCurrentlyEnabled ? 'stop' : 'start';
        
        btnAi.disabled = true;
        const originalHTML = btnAi.innerHTML;
        btnAi.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

        try {
            const response = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ action })
            });

            const result = await response.json();
            if (result.success) {
                currentBotState.aistate = result.aistate;
                currentBotState.isRunning = result.isRunning;
                
                aiBotUI.setRunningStatus(
                    result.isRunning, 
                    currentBotState.config.ai.stopAtCycle,
                    result.historyCount || 0
                );
            }
        } catch (error) {
            console.error("❌ Global AI Toggle Error:", error);
            btnAi.innerHTML = originalHTML;
        } finally {
            btnAi.disabled = false;
        }
    }
});

// Delegación global para configuración de IA (Inputs)
document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'ai-amount-usdt') {
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) return;
        await saveAIConfigGlobal({ amountUsdt: val });
    }
    
    if (e.target && e.target.id === 'ai-stop-at-cycle') {
        await saveAIConfigGlobal({ stopAtCycle: e.target.checked });
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
        if (data.success) {
            if (data.config) currentBotState.config.ai = { ...currentBotState.config.ai, ...data.config };
            logStatus(data.message || "AI Config Updated", "success");
        }
    } catch (e) { console.error("Error saving global config", e); }
}

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