/**
 * main.js - Central Hub (Pro-Sync 2026)
 * Estado: Corregida persistencia de balance y gestión de estados de IA
 * Integración: Soporte, Notificaciones y Ajustes activados.
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
import { askConfirmation } from './modules/confirmModal.js';

// [RESTAURADO] Importación para mensajes flotantes (Toasts)
import { displayMessage } from './modules/ui/notifications.js';

// [NUEVO] Importamos la lógica de roles
import { applyRolePermissions } from './modules/role.js';

// --- CONFIGURATION ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

// Fuente única de verdad (Single Source of Truth)
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
    aibot: () => import('./modules/aibot.js'),
    admin: () => import('./modules/admin.js')
};

// --- LOG SYSTEM (Global) ---
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
        console.log("🚀 Initializing Authenticated App Flow...");
        
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
                console.log("🔔 Notifications Module Linked to Socket");
            }).catch(err => console.error("❌ Error loading notifications module:", err));
        }

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
                const aiHistoryCont = document.getElementById('ai-history-table-body');
                if (aiOrderList) fetchOrders('ai', aiOrderList);
                if (aiHistoryCont) fetchOrders('ai', aiHistoryCont);
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
    }
}

function syncAIElementsInDOM() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) aiInput.value = currentBotState.config.ai.amountUsdt || "";
    if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle;
    
    const isAiRunning = currentBotState.aistate === 'RUNNING';

    if (aiBotUI) {
        aiBotUI.setRunningStatus(
            isAiRunning, 
            currentBotState.config.ai.stopAtCycle,
            currentBotState.historyCount || 0
        );
    }
}

// --- GLOBAL EVENT DELEGATION (AI, LONG & SHORT) - AUDITADO Y CORREGIDO ---
document.addEventListener('click', async (e) => {
    // 1. Capturamos los botones por sus dos posibles estados (Start y Stop)
    const btnAi = e.target.closest('#btn-start-ai') || e.target.closest('#btn-stop-ai') || e.target.closest('#austartai-btn') || e.target.closest('#austopai-btn');
    
    // Captura Long (Inicia con 'austartl' o 'austopl')
    const btnLong = e.target.closest('#austartl-btn') || e.target.closest('#austopl-btn');
    
    // Captura Short (Inicia con 'austarts' o 'austops')
    const btnShort = e.target.closest('#austarts-btn') || e.target.closest('#austops-btn');

    // 2. Si el clic no fue en un botón de control, abortamos
    if (!btnAi && !btnLong && !btnShort) return;

    e.preventDefault();
    e.stopPropagation();

    let btn, side, stateKey, endpoint;

    // 3. Asignación de variables según el botón detectado
    if (btnAi) {
        btn = btnAi; side = 'AI'; stateKey = 'aistate'; endpoint = '/api/ai/toggle';
    } else if (btnLong) {
        btn = btnLong; side = 'long'; stateKey = 'lstate'; endpoint = '/api/v1/config/update-config';
    } else if (btnShort) {
        btn = btnShort; side = 'short'; stateKey = 'sstate'; endpoint = '/api/v1/config/update-config';
    }

    if (btn.disabled) return;

    // Detectamos si está RUNNING o STOPPED según el estado global
    const isRunning = currentBotState[stateKey] === 'RUNNING';
    const action = isRunning ? 'stop' : 'start';

    btn.classList.add('opacity-50', 'cursor-wait');
    
    // AHORA SÍ: El modal se disparará siempre porque el ID fue capturado
    const confirmado = await askConfirmation(side, action);
    
    btn.classList.remove('opacity-50', 'cursor-wait');

    if (!confirmado) return;

    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

    try {
        let bodyPayload;
        let finalEndpoint = endpoint; 

        if (side === 'AI') {
            bodyPayload = { action, side: side.toLowerCase() };
        } else {
            const sideLow = side.toLowerCase();
            finalEndpoint = `/api/autobot/${action}/${sideLow}`;

            bodyPayload = {
                strategy: sideLow,
                config: {
                    [sideLow]: {
                        enabled: action === 'start'
                    }
                }
            };
        }

        const response = await fetch(`${BACKEND_URL}${finalEndpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(bodyPayload) 
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error del Servidor: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
            if (side === 'AI') {
                currentBotState.aistate = result.aistate;
                currentBotState.isRunning = result.isRunning;
            } else {
                currentBotState[stateKey] = (action === 'start' ? 'RUNNING' : 'STOPPED');
                
                if (result.data) {
                    currentBotState.config[side.toLowerCase()] = {
                        ...currentBotState.config[side.toLowerCase()],
                        ...result.data[side.toLowerCase()]
                    };
                }
            }

            logStatus(`${side.toUpperCase()} ${action.toUpperCase()} exitoso`, "success");
            displayMessage(`Estrategia ${side.toUpperCase()}: ${action.toUpperCase()}`, action === 'start' ? 'success' : 'warning');

            // FUERZA LA ACTUALIZACIÓN VISUAL PARA QUITAR EL SPINNER
            await updateBotUI(currentBotState); 
        } else {
            logStatus(result.message || "Error en la operación", "error");
            // SI FALLA EL SERVER, RESTAURAMOS EL BOTÓN
            btn.innerHTML = originalHTML; 
        }
    } catch (error) {
        console.error(`❌ Error en Toggle ${side}:`, error);
        logStatus(error.message, "error");
        // SI HAY ERROR DE RED, RESTAURAMOS EL BOTÓN
        btn.innerHTML = originalHTML; 
    } finally {
        // ESTO ES VITAL: Pase lo que pase, habilitamos el botón y quitamos clases de espera
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-wait');
        
        // Si después de updateBotUI el botón sigue con el spinner (porque el ID cambió de start a stop)
        // esta línea de seguridad lo limpia:
        if (btn.querySelector('.fa-spin')) {
             btn.innerHTML = originalHTML;
        }
    }
});

// Delegación global para configuración de IA e Inputs de Autobot
document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'ai-amount-usdt') {
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) return;
        await saveAIConfigGlobal({ amountUsdt: val });
    }
    
    if (e.target && e.target.id === 'ai-stop-at-cycle') {
        await saveAIConfigGlobal({ stopAtCycle: e.target.checked });
    }

    if (e.target && (e.target.id === 'au-stop-long-at-cycle' || e.target.id === 'au-stop-short-at-cycle')) {
        const side = e.target.id.includes('long') ? 'long' : 'short';
        logStatus(`Updating ${side.toUpperCase()} stop condition...`, "info");
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
    applyRolePermissions();
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

    const cog = document.getElementById('settings-icon');
    if (cog) cog.addEventListener('click', () => logStatus("Settings panel coming soon.", "info"));

    const profile = document.getElementById('user-profile-icon');
    if (profile) profile.addEventListener('click', () => {
        const uId = localStorage.getItem('userId') || 'Guest';
        logStatus(`User Profile ID: ${uId}`, "info");
    });
});

// --- AUTO-REACTIVADOR AL REGRESAR ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        import('./modules/socket.js').then(m => {
            if (!m.socket || !m.socket.connected) {
                m.initSocket();
            } else {
                m.socket.emit('get-bot-state');
            }
        });
        const activeTab = document.querySelector('.nav-link.active')?.dataset.tab;
        if (activeTab) initializeTab(activeTab); 
    }
});