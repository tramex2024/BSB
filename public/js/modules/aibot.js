// public/js/modules/aibot.js

import { socket } from '../main.js';

export function initializeAIBotView() {
    console.log("🚀 AIBot Dashboard Conectado");
    setupAISocketListeners();
    setupAIControls();
}

function setupAISocketListeners() {
    // 1. Actualización de decisiones (ADX, Stoch, Mensajes)
    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });

    // 2. Ejecución de órdenes (Saldo virtual y PNL)
    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        addTradeToLog(data);
    });

    // 3. Estado del Núcleo (Panic Stop, etc.)
    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (!data.isRunning && btn) {
            btn.textContent = "ACTIVAR NÚCLEO IA";
            btn.className = "w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all";
        }
    });
}

function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const predictionText = document.getElementById('ai-prediction-text');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl) {
        const value = (data.confidence * 100).toFixed(1);
        confidenceEl.textContent = `${value}%`;
        
        // Cambiar color según confianza
        if (value > 80) confidenceEl.className = 'absolute inset-0 flex items-center justify-center text-3xl font-bold text-emerald-500';
        else if (value < 40) confidenceEl.className = 'absolute inset-0 flex items-center justify-center text-3xl font-bold text-red-500';
        else confidenceEl.className = 'absolute inset-0 flex items-center justify-center text-3xl font-bold text-blue-500';
    }

    if (predictionText && data.message) {
        predictionText.textContent = data.message;
    }

    // Log de sistema
    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = 'text-gray-400 border-l border-blue-500 pl-2 mb-1 animate-pulse';
        log.innerHTML = `<span class="text-blue-800">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 50) logContainer.lastChild.remove();
    }
}

function updateAIBalance(data) {
    // Buscamos el elemento que contiene el saldo (basado en tu HTML)
    const balanceEl = document.querySelector('.text-emerald-400.font-mono');
    if (balanceEl && data.currentVirtualBalance) {
        balanceEl.textContent = `$${data.currentVirtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
    }
}

function addTradeToLog(data) {
    const logContainer = document.getElementById('ai-log-container');
    if (logContainer) {
        const tradeLog = document.createElement('div');
        const color = data.side === 'BUY' ? 'text-emerald-400' : 'text-orange-400';
        tradeLog.className = `${color} font-bold border-l-2 border-white pl-2 my-1`;
        tradeLog.innerHTML = `[TRADE] ${data.side} @ ${data.price} | PNL: ${data.pnlLastTrade || 0}`;
        logContainer.prepend(tradeLog);
    }
}

async function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    const balanceEl = document.querySelector('.text-emerald-400.font-mono');
    
    if (!btn) return;

    // 1. Cargar estado inicial al abrir la página
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/ai/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const state = await response.json();

        // Sincronizar UI con el estado real del servidor
        if (state.isRunning) {
            btn.textContent = "NÚCLEO ONLINE";
            btn.className = "w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all";
        }

        if (balanceEl && state.virtualBalance) {
            balanceEl.textContent = `$${state.virtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
        }
    } catch (err) {
        console.error("Error al obtener estado inicial de IA:", err);
    }

    // 2. Evento Click para Activar/Desactivar
    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        const isActivating = btn.textContent.includes("ACTIVAR") || btn.textContent.includes("OFFLINE");

        // UI Feedback inmediato
        btn.textContent = isActivating ? "INICIANDO..." : "DETENIENDO...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/ai/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                if (result.isRunning) {
                    btn.textContent = "NÚCLEO ONLINE";
                    btn.className = "w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all";
                } else {
                    btn.textContent = "ACTIVAR NÚCLEO IA";
                    btn.className = "w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all";
                }
            }
        } catch (err) {
            console.error("Error en el toggle de IA:", err);
            btn.textContent = "ERROR DE SISTEMA";
            btn.className = "w-full py-3 bg-red-600 rounded-lg font-bold";
        } finally {
            btn.disabled = false;
        }
    });
}