// public/js/modules/aibot.js

import { socket, currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';

/**
 * Inicializa la vista de la IA cada vez que el usuario entra en la pestaña.
 */
export function initializeAibotView() {
    console.log("🚀 Sistema IA: Sincronizando interfaz...");
    
    // 1. Limpiamos listeners previos para evitar ejecuciones duplicadas
    if (socket) {
        socket.off('ai-status-update');
        socket.off('ai-history-data');
        socket.off('ai-order-executed');
        socket.off('ai-decision-update');
        socket.off('market-signal-update');
    }

    // 2. Configuramos los escuchadores activos
    setupAISocketListeners();
    
    // 3. Configuramos el botón de control Start/Stop
    setupAIControls();
    
    // 4. Sincronización inmediata con el estado global
    aiBotUI.setRunningStatus(currentBotState.isRunning);

    // 5. Solicitamos datos frescos al servidor
    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
    }
}

/**
 * Escucha los eventos del socket específicos para la vista de IA
 */
function setupAISocketListeners() {
    if (!socket) return;

    // Monitor de estado: Progreso (1/50), Balance y Running
    socket.on('ai-status-update', (data) => {
        currentBotState.virtualBalance = data.virtualBalance;
        currentBotState.isRunning = data.isRunning;

        // Actualización del balance
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${parseFloat(data.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // Lógica del botón: Sincronización con el umbral de 50 velas para EMA50
        const btnAi = document.getElementById('btn-start-ai');
        if (btnAi) {
            if (data.isRunning && data.historyCount < 50) {
                btnAi.textContent = `ANALIZANDO... (${data.historyCount}/50)`;
                btnAi.className = "w-full py-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-2xl font-black text-xs animate-pulse";
                btnAi.disabled = false;
            } else {
                aiBotUI.setRunningStatus(data.isRunning);
            }
        }
    });

    // NUEVO: Decisiones Neurales (Confianza, Mensajes y Círculo UI)
    socket.on('ai-decision-update', (data) => {
        // Actualiza el círculo de progreso y el texto de predicción
        if (aiBotUI.updateConfidence) {
            aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        }
        
        // Añade la línea a la terminal de logs [LOG_NEURAL_STREAM]
        if (aiBotUI.addLogEntry) {
            aiBotUI.addLogEntry(data.message, data.confidence);
        }
    });

    // NUEVO: Indicadores Técnicos en Tiempo Real (ADX / STOCH)
    socket.on('market-signal-update', (data) => {
        const adxEl = document.getElementById('ai-adx-val');
        const stochEl = document.getElementById('ai-stoch-val');
        
        if (adxEl && data.adx !== undefined) {
            adxEl.innerText = data.adx.toFixed(1);
            // Cambio de color si la tendencia es fuerte (>25)
            adxEl.className = `text-[10px] font-mono ${data.adx > 25 ? 'text-emerald-400' : 'text-blue-400'}`;
        }
        
        if (stochEl && data.stochK !== undefined) {
            stochEl.innerText = data.stochK.toFixed(1);
        }
    });

    // Historial completo de operaciones
    socket.on('ai-history-data', (history) => {
        aiBotUI.updateHistoryTable(history);
    });

    // Ejecución de órdenes (Toasts y Sonidos)
    socket.on('ai-order-executed', (order) => {
        showAiToast(order);
        playNeuralSound(order.side);
        socket.emit('get-ai-history'); // Refrescar tabla inmediatamente
    });
}

/**
 * Configura el botón de encendido/apagado y el input de configuración (USDT)
 */
function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    const aiInput = document.getElementById('ai-amount-usdt'); // Referencia al nuevo input
    if (!btn) return;

    // 1. LIMPIEZA DE LISTENERS: Clonamos el botón para evitar duplicidad de eventos
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // 2. LOGICA DEL INPUT (Monto USDT)
    if (aiInput) {
        // Sincronizar valor inicial desde el estado global si existe
        if (currentBotState.config && currentBotState.config.ai && currentBotState.config.ai.amountUsdt) {
            aiInput.value = currentBotState.config.ai.amountUsdt;
        }

        // Bloquear input si la IA ya está corriendo al cargar la vista
        if (currentBotState.isRunning) {
            aiInput.disabled = true;
            aiInput.classList.add('opacity-40', 'cursor-not-allowed');
        }

        // Evento de guardado automático al cambiar el valor
        aiInput.addEventListener('change', async () => {
            const amount = parseFloat(aiInput.value);
            if (isNaN(amount) || amount <= 0) return;

            try {
                const response = await fetch(`${BACKEND_URL}/api/ai/config`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ amountUsdt: amount })
                });
                
                const data = await response.json();
                if (data.success) {
                    if (aiBotUI.addLogEntry) {
                        aiBotUI.addLogEntry(`Configuración: Monto actualizado a $${amount} USDT`, 0.5);
                    }
                    // Actualizamos el estado local para mantener coherencia
                    if (!currentBotState.config.ai) currentBotState.config.ai = {};
                    currentBotState.config.ai.amountUsdt = amount;
                }
            } catch (error) {
                console.error("❌ Error guardando monto IA:", error);
            }
        });
    }

    // 3. LOGICA DEL BOTÓN DE ACCIÓN (Start/Stop)
    newBtn.addEventListener('click', async () => {
        const action = currentBotState.isRunning ? 'stop' : 'start';

        // UI State: Procesando
        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";
        newBtn.className = "w-full py-4 bg-gray-600 text-white rounded-2xl font-black text-xs animate-pulse cursor-wait";

        try {
            const response = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ action: action })
            });

            const result = await response.json();

            if (result.success) {
                // Actualizar estado global
                currentBotState.isRunning = result.isRunning;
                
                // Actualizar Interfaz (Botón, dots y bloqueo de input)
                aiBotUI.setRunningStatus(result.isRunning);
                
                if (aiBotUI.addLogEntry) {
                    const statusMsg = result.isRunning ? "NÚCLEO IA ACTIVADO" : "NÚCLEO IA EN STANDBY";
                    aiBotUI.addLogEntry(statusMsg, result.isRunning ? 0.9 : 0.4);
                }
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error("❌ Error API IA:", error);
            // Revertir UI al estado actual conocido en caso de fallo
            aiBotUI.setRunningStatus(currentBotState.isRunning);
            alert(`Error de conexión: ${error.message || "No se pudo contactar con el núcleo"}`);
        } finally {
            newBtn.disabled = false;
        }
    });
}

/**
 * Notificación visual tipo Toast mejorada
 */
function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md ${
        isBuy ? 'bg-emerald-900/90 border-emerald-400 shadow-emerald-500/20' : 'bg-red-900/90 border-red-400 shadow-red-500/20'
    } text-white animate-bounceIn`;
    
    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="p-2 bg-white/10 rounded-full text-lg">${isBuy ? '🚀' : '💰'}</div>
            <div>
                <p class="text-[10px] font-bold uppercase tracking-tighter opacity-70">IA Core Execution</p>
                <p class="text-xs font-black">${order.side} BTC @ $${parseFloat(order.price).toLocaleString()}</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.replace('animate-bounceIn', 'animate-fadeOut');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Feedback auditivo "Neural"
 */
function playNeuralSound(side) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'sine';
        // Frecuencia alta para compra, baja para venta
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        // Silencio si el navegador bloquea el audio sin interacción previa
    }
}