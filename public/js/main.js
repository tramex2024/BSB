/**
 * main.js - Central Hub
 * AI Core English Version 2026
 * Refactorización: Estado Global Multiusuario y Sincronización
 */
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';
import { initSocket } from './modules/socket.js'; 

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
        symbol: 'BTCUSDT',
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

    // Solo iniciamos comunicación si tenemos la sesión completa
    if (token && userId) {
        console.log("🚀 Initializing Authenticated App Flow...");
        initSocket();
    } else {
        console.warn("⚠️ Partial session detected. Waiting for full login.");
    }
}

// --- TAB MANAGEMENT ---
export async function initializeTab(tabName) {
    // Limpieza de intervalos al cambiar de pestaña
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
                // Sincronizamos la vista con el estado global actual inmediatamente
                await initFn(currentBotState);
                
                // Si es el dashboard, forzamos actualización de widgets específicos
                if (tabName === 'dashboard' && module.updateDistributionWidget) {
                    module.updateDistributionWidget(currentBotState);
                }
            }
        }

        // Sincronización estética de elementos de IA
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
    
    aiBotUI.setRunningStatus(currentBotState.isRunning, currentBotState.stopAtCycle);
}

// --- GLOBAL EVENT DELEGATION ---
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'btn-start-ai') {
        const btnAi = e.target;
        const isCurrentlyEnabled = currentBotState.isRunning;
        const action = isCurrentlyEnabled ? 'stop' : 'start';
        
        btnAi.disabled = true;
        btnAi.innerText = "PROCESSING...";

        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.success) {
                currentBotState.isRunning = data.isRunning;
                aiBotUI.setRunningStatus(data.isRunning, currentBotState.stopAtCycle);
            }
        } catch (err) {
            console.error("Error toggling AI:", err);
            logStatus("Error al cambiar estado de IA", "error");
        } finally {
            btnAi.disabled = false;
        }
    }
});

// --- INITIAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab); 
    
    // Al registrar eventos de login, pasamos la función que arranca la app completa
    initializeAppEvents(initializeFullApp);
    
    updateLoginIcon();
    
    // Auto-login si ya existe sesión completa en el navegador
    const hasToken = localStorage.getItem('token');
    const hasUserId = localStorage.getItem('userId');

    if (hasToken && hasUserId) { 
        initializeFullApp(); 
    }
    
    // Siempre cargamos el dashboard al inicio
    initializeTab('dashboard'); 
});