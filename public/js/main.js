//BSB/public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';

// --- CONFIGURACIÓN ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    lpc: 0, 
    spc: 0, 
    lpm: 0,
    spm: 0,
    isRunning: false, // Estado de la IA
    config: {
        long: {},
        short: {},
        ai: {}
    }
};

export let socket = null;
export let intervals = {}; 

let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- GESTIÓN DE CONEXIÓN ---
function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    const aiSyncDot = document.getElementById('ai-sync-dot');
    const aiSyncText = document.getElementById('ai-sync-text');

    if (status === 'CONNECTED') {
        if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
        if (aiSyncDot) aiSyncDot.classList.replace('bg-gray-500', 'bg-emerald-500');
        if (aiSyncText) aiSyncText.innerText = "AI CORE LINKED";
    } else {
        if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
        if (aiSyncDot) aiSyncDot.classList.replace('bg-emerald-500', 'bg-gray-500');
        if (aiSyncText) aiSyncText.innerText = "DISCONNECTED";
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 10000); // 10 segundos de margen para Render (latencia)
}

export function logStatus(message, type = 'info') {
    if (type === 'error') {
        logQueue = [{ message, type }]; 
    } else {
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
    
    setTimeout(() => { processNextLog(); }, 2500);
}

// --- INICIALIZACIÓN DE SOCKETS ---
export function initializeFullApp() {
    if (socket && socket.connected) return;
    if (typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status');  
    });

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price) {
            currentBotState.price = parseFloat(data.price);
            updateBotUI(currentBotState);
        }
    });

    socket.on('bot-log', (data) => {
        if (data && data.message) {
            logStatus(data.message, data.type || 'info');
            // Sincronizar también con la terminal de IA si está activa
            if (aiBotUI && typeof aiBotUI.addLog === 'function') {
                aiBotUI.addLog(data.message, data.type);
            }
        }
    });

    socket.on('bot-state-update', (state) => {
        if (state) {
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
                delete state.config;
            }
            Object.assign(currentBotState, state);
            
            // Actualizar balance virtual de IA si viene en el estado global
            if(state.virtualAiBalance !== undefined) {
                const balEl = document.getElementById('ai-virtual-balance');
                if(balEl) balEl.innerText = `$${state.virtualAiBalance.toFixed(2)}`;
            }
        }
        updateBotUI(currentBotState);
        updateControlsState(currentBotState); 
    });

    // 🧠 LISTENERS ESPECÍFICOS DE IA
    socket.on('ai-decision-update', (data) => {
        if (!data) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        aiBotUI.addLog(data.message, data.confidence >= 0.85 ? 'success' : 'info');

        // Actualizar indicadores ADX/Stoch
        if (data.indicators) {
            const adxEl = document.getElementById('ai-adx-val');
            const stochEl = document.getElementById('ai-stoch-val');
            if (adxEl) adxEl.innerText = (data.indicators.adx || 0).toFixed(1);
            if (stochEl) stochEl.innerText = (data.indicators.stochRsi || 0).toFixed(1);
        }
    });

    socket.on('ai-history-update', (trades) => {
        aiBotUI.updateHistoryTable(trades);
    });

    socket.on('ai-status-update', (data) => {
        if (!data) return;
        currentBotState.virtualBalance = data.virtualBalance;
        currentBotState.isRunning = data.isRunning;
        
        aiBotUI.setRunningStatus(data.isRunning);
        
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${data.virtualBalance.toFixed(2)}`;
        }

        // Actualizar modo Visual (Simulación/Real)
        const modeEl = document.getElementById('ai-mode-status');
        if (modeEl) {
            modeEl.innerText = data.isRealMoney ? 'Live Exchange' : 'Simulación Virtual';
            modeEl.className = data.isRealMoney ? 'text-red-500 font-mono animate-pulse' : 'text-yellow-500 font-mono';
        }
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
}

// --- GESTIÓN DE PESTAÑAS (Versión Completa con IA Engine) ---
export async function initializeTab(tabName) {
    // Limpiar intervalos previos para evitar fugas de memoria
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        // 1. Cargar el HTML de la pestaña
        const response = await fetch(`./${tabName}.html`);
        const html = await response.text();
        mainContent.innerHTML = html;
        
        // 2. Importar e inicializar el módulo de la vista si existe
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            if (typeof module[initFnName] === 'function') {
                await module[initFnName](currentBotState); 
            }
        }

        // 3. CONFIGURACIÓN ESPECÍFICA DE LA VISTA DE IA
        if (tabName === 'aibot') {
            const btnAi = document.getElementById('btn-start-ai');
            const aiInput = document.getElementById('ai-amount-usdt');

            // --- SINCRONIZACIÓN INICIAL ---
            // Aplicar estilos y estados (bloqueo de input si está corriendo)
            aiBotUI.setRunningStatus(currentBotState.isRunning); 
            
            // Cargar valor de balance desde la configuración global
            if (aiInput && currentBotState.config.ai && currentBotState.config.ai.amountUsdt) {
                aiInput.value = currentBotState.config.ai.amountUsdt;
            }

            // --- GESTIÓN DEL INPUT (MONTO USDT) ---
            if (aiInput) {
                let aiConfigTimeout;
                aiInput.addEventListener('input', () => {
                    clearTimeout(aiConfigTimeout);
                    // Esperar 1.5 segundos después de que el usuario deje de escribir
                    aiConfigTimeout = setTimeout(async () => {
                        const amount = parseFloat(aiInput.value);
                        if (isNaN(amount) || amount <= 0) return;

                        try {
                            const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                                },
                                body: JSON.stringify({ amountUsdt: amount })
                            });
                            const data = await res.json();
                            if(data.success) {
                                aiBotUI.addLog(`Configuración: Monto de entrenamiento actualizado a $${amount}`, 'info');
                                // Actualizar estado local
                                if (!currentBotState.config.ai) currentBotState.config.ai = {};
                                currentBotState.config.ai.amountUsdt = amount;
                            }
                        } catch (e) {
                            console.error("Error al sincronizar configuración de IA:", e);
                            aiBotUI.addLog("Error al sincronizar monto con el servidor", "error");
                        }
                    }, 1500);
                });
            }

            // --- GESTIÓN DEL BOTÓN DE ENCENDIDO/APAGADO ---
            if (btnAi) {
                btnAi.onclick = async () => {
                    const action = currentBotState.isRunning ? 'stop' : 'start';
                    
                    // Estado visual de carga
                    btnAi.disabled = true;
                    btnAi.innerText = "PROCESANDO...";
                    btnAi.className = "w-full py-4 bg-gray-700 text-white rounded-2xl font-black text-xs animate-pulse";

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
                        
                        if(data.success) {
                            currentBotState.isRunning = data.isRunning;
                            // Actualizar UI a través del módulo especializado
                            aiBotUI.setRunningStatus(data.isRunning);
                            aiBotUI.addLog(`Sistema IA: ${action === 'start' ? 'NÚCLEO ACTIVADO' : 'NÚCLEO DETENIDO'}`, 'success');
                        } else {
                            throw new Error(data.message);
                        }
                    } catch (e) {
                        aiBotUI.addLog(`Error de Conexión: ${e.message || "Fallo en el servidor"}`);
                        // Revertir UI al estado actual conocido
                        aiBotUI.setRunningStatus(currentBotState.isRunning);
                    } finally {
                        btnAi.disabled = false;
                    }
                };
            }
        }

    } catch (error) { 
        console.error("❌ Error crítico cargando vista:", error); 
    }
}
// --- EVENTOS DE INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab); 
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
        initializeTab('autobot'); 
    } else { 
        initializeTab('dashboard'); 
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && socket.connected) {
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status'); 
        
        updateControlsState(currentBotState);
        if (aiBotUI) {
            aiBotUI.setRunningStatus(currentBotState.isRunning);
        }
    }
});