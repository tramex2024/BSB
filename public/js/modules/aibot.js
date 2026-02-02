/**
 * Archivo: public/js/modules/aibot.js
 * Gestión de Interfaz y Sincronización del Núcleo IA
 */

import { socket, currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';

/**
 * Inicializa la vista de la IA cada vez que el usuario entra en la pestaña.
 */
export function initializeAibotView() {
    console.log("🚀 Sistema IA: Sincronizando interfaz...");
    
    if (socket) {
        socket.off('ai-status-update');
        socket.off('ai-history-data');
        socket.off('ai-order-executed');
        socket.off('ai-decision-update');
        socket.off('market-signal-update');
    }

    setupAISocketListeners();
    setupAIControls();
    
    // Estado inicial visual basado en la memoria actual
    const stopAtCycle = currentBotState.config?.ai?.stopAtCycle || false;
    aiBotUI.setRunningStatus(currentBotState.isRunning, stopAtCycle);

    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
    }
}

/**
 * Escucha actualizaciones en tiempo real desde el motor del servidor
 */
function setupAISocketListeners() {
    if (!socket) return;

    socket.on('ai-status-update', (data) => {
        // Actualizar estado global en memoria
        currentBotState.virtualBalance = data.virtualBalance;
        currentBotState.isRunning = data.isRunning;

        // 1. Actualizar Balance en Pantalla
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${parseFloat(data.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // 2. Gestionar Estado General (Incluye el switch stopAtCycle)
        const btnAi = document.getElementById('btn-start-ai');
        
        // Si está analizando (menos de 50 velas), mostramos estado intermedio
        if (data.isRunning && data.historyCount < 50) {
            if (btnAi) {
                btnAi.textContent = `ANALIZANDO... (${data.historyCount}/50)`;
                btnAi.className = "w-full py-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-2xl font-black text-xs animate-pulse";
            }
        } else {
            // Sincronización COMPLETA (Botón + Switch + Input)
            aiBotUI.setRunningStatus(data.isRunning, data.stopAtCycle);
        }
    });

    socket.on('ai-decision-update', (data) => {
        if (aiBotUI.updateConfidence) aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        if (aiBotUI.addLogEntry) aiBotUI.addLogEntry(data.message, data.confidence);
    });

    socket.on('market-signal-update', (data) => {
        const adxEl = document.getElementById('ai-adx-val');
        const stochEl = document.getElementById('ai-stoch-val');
        if (adxEl && data.adx !== undefined) {
            adxEl.innerText = data.adx.toFixed(1);
            adxEl.className = `text-[10px] font-mono ${data.adx > 25 ? 'text-emerald-400' : 'text-blue-400'}`;
        }
        if (stochEl && data.stochK !== undefined) {
            stochEl.innerText = data.stochK.toFixed(1);
        }
    });

    socket.on('ai-history-data', (history) => {
        aiBotUI.updateHistoryTable(history);
    });

    socket.on('ai-order-executed', (order) => {
        showAiToast(order);
        playNeuralSound(order.side);
        socket.emit('get-ai-history'); 
    });
}

/**
 * Configura los controles físicos del Dashboard
 */
function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopCycleCheck = document.getElementById('au-stop-ai-at-cycle');
    const btnPanic = document.getElementById('btn-panic-ai');
    
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Sincronización inicial desde el estado cargado al iniciar la APP
    if (currentBotState.config && currentBotState.config.ai) {
        const aiConfig = currentBotState.config.ai;
        if (aiInput && aiConfig.amountUsdt) aiInput.value = aiConfig.amountUsdt;
        if (stopCycleCheck && aiConfig.stopAtCycle !== undefined) stopCycleCheck.checked = aiConfig.stopAtCycle;
    }

    if (aiInput) {
        aiInput.addEventListener('change', async () => {
            const amount = parseFloat(aiInput.value);
            if (isNaN(amount) || amount <= 0) return;
            await saveAIConfig({ amountUsdt: amount });
        });
    }

    if (stopCycleCheck) {
        stopCycleCheck.addEventListener('change', async () => {
            await saveAIConfig({ stopAtCycle: stopCycleCheck.checked });
        });
    }

    newBtn.addEventListener('click', async () => {
        const action = currentBotState.isRunning ? 'stop' : 'start';
        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";

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
                currentBotState.isRunning = result.isRunning;
                // Al encender/apagar pasamos el estado actual del switch
                aiBotUI.setRunningStatus(result.isRunning, stopCycleCheck?.checked);
            }
        } catch (error) {
            console.error("❌ Error API IA Toggle:", error);
            aiBotUI.setRunningStatus(currentBotState.isRunning, stopCycleCheck?.checked);
        } finally {
            newBtn.disabled = false;
        }
    });

    if (btnPanic) {
        btnPanic.addEventListener('click', async () => {
            if (!confirm("🚨 ¿VENTA DE EMERGENCIA? Se liquidarán posiciones y se detendrá la IA inmediatamente.")) return;
            
            try {
                btnPanic.disabled = true;
                btnPanic.innerHTML = "LIQUIDANDO...";
                
                const response = await fetch(`${BACKEND_URL}/api/ai/panic`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                if (result.success) {
                    currentBotState.isRunning = false;
                    aiBotUI.setRunningStatus(false, false); // Apagamos todo
                    if (aiBotUI.addLogEntry) aiBotUI.addLogEntry("🚨 OPERACIÓN DE EMERGENCIA COMPLETADA", 1);
                }
            } catch (error) {
                console.error("❌ Error en Panic Sell:", error);
            } finally {
                btnPanic.disabled = false;
                btnPanic.innerHTML = "PANIC SELL & STOP";
            }
        });
    }
}

/**
 * Persiste la configuración en el servidor
 */
async function saveAIConfig(payload) {
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
        if (data.success && aiBotUI.addLogEntry) {
            const key = Object.keys(payload)[0];
            const msg = key === 'stopAtCycle' 
                ? `Ciclo Inteligente: ${payload[key] ? 'ACTIVADO' : 'DESACTIVADO'}`
                : `Configuración: Monto actualizado a $${payload[key]} USDT`;
            aiBotUI.addLogEntry(msg, 0.5);
        }
    } catch (error) {
        console.error("❌ Error guardando configuración IA:", error);
    }
}

function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-500 transform translate-y-0 ${
        isBuy ? 'bg-emerald-900/90 border-emerald-400 shadow-emerald-500/20' : 'bg-red-900/90 border-red-400 shadow-red-500/20'
    } text-white animate-bounceIn`;

    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="p-2 bg-white/10 rounded-full text-lg">${isBuy ? '🚀' : '💰'}</div>
            <div>
                <p class="text-[10px] font-bold uppercase tracking-tighter opacity-70">IA Core Execution</p>
                <p class="text-xs font-black">${order.side} BTC @ $${parseFloat(order.price).toLocaleString()}</p>
            </div>
        </div>`;

    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function playNeuralSound(side) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
}