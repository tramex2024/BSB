/**
 * main.js - Central Hub
 * AI Core English Version 2026
 * Refactorización: Estado Global Multiusuario y Sincronización
 * Actualización: Unificación de diseño de órdenes (Card Style)
 */
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';
import { initSocket } from './modules/socket.js'; 
import { fetchOrders } from './modules/orders.js'; // Sincronización de órdenes persistente

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

            // --- PERSISTENCIA ESPECÍFICA PARA AIBOT AL REGRESAR DE NAVEGACIÓN ---
            // Corregido: Ahora usa el formato de 2 parámetros para fetchOrders y unifica estilo card
            if (tabName === 'aibot') {
                const aiOrderList = document.getElementById('ai-order-list'); // Nuevo contenedor unificado
                if (aiOrderList) {
                    fetchOrders('ai', aiOrderList);
                } else {
                    // Fallback por si aún existen los IDs antiguos de tabla
                    const aiHistoryCont = document.getElementById('ai-history-table-body');
                    if (aiHistoryCont) fetchOrders('ai', aiHistoryCont);
                }
            }
            
            // --- PERSISTENCIA ESPECÍFICA PARA AUTOBOT AL REGRESAR DE NAVEGACIÓN ---
            if (tabName === 'autobot') {
                const auOrderList = document.getElementById('au-order-list');
                if (auOrderList) fetchOrders('all', auOrderList);
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
    
    // Sincronización del botón basada en el estado real
    aiBotUI.setRunningStatus(
        currentBotState.isRunning, 
        currentBotState.stopAtCycle || currentBotState.config.ai.stopAtCycle,
        currentBotState.historyCount || 0
    );
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
    // 1. Initial State Check (Prioritize Session)
    const hasToken = localStorage.getItem('token');
    const hasUserId = localStorage.getItem('userId');

    if (hasToken && hasUserId) { 
        // If session exists, boot up the socket and clean up logs immediately
        initializeFullApp(); 
    } else {
        // If no session, show a clean prompt in English
        logStatus("Please sign in to access bot controls.", "warning");
    }

    // 2. Setup Navigation & Core UI Events
    setupNavTabs(initializeTab); 
    
    // When login is successful, this callback will trigger initializeFullApp
    initializeAppEvents(initializeFullApp);
    
    // 3. Update Visual Elements
    updateLoginIcon();
    
    // 4. Load initial view (Dashboard)
    initializeTab('dashboard'); 
});