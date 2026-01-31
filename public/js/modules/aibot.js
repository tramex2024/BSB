// public/js/modules/aibot.js

import { socket, currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { sendConfigToBackend } from './apiService.js'; // Importante para la persistencia

let configDebounceTimeout = null;

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

    // 2. Configuramos los escuchadores activos del servidor
    setupAISocketListeners();
    
    // 3. Configuramos el botón de control Start/Stop
    setupAIControls();

    // 4. NUEVO: Configuramos los listeners de autoguardado para los inputs (como en el autobot)
    setupAIConfigListeners();
    
    // 5. Sincronización inmediata con el estado global
    aiBotUI.setRunningStatus(currentBotState.isRunning);

    // 6. Solicitamos datos frescos al servidor
    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
    }
}

/**
 * NUEVO: Escucha cambios en los inputs para guardado automático (Persistencia BSB)
 */
function setupAIConfigListeners() {
    const aiConfigIds = ['auamountai-usdt']; // El ID que pusimos en el HTML
    
    aiConfigIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('input', () => {
            // Aplicamos el debounce de 500ms característico de tu sistema
            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            configDebounceTimeout = setTimeout(async () => {
                try {
                    // Reutilizamos la función central que guarda toda la configuración en la DB
                    await sendConfigToBackend(); 
                    console.log("✅ Configuración de IA persistida en DB");
                } catch (err) {
                    console.error("❌ Error guardando config IA:", err);
                }
            }, 500);
        });
    });
}

/**
 * Escucha los eventos del socket específicos para la vista de IA
 */
function setupAISocketListeners() {
    if (!socket) return;

    // Monitor de estado: Balance y Running
    socket.on('ai-status-update', (data) => {
        currentBotState.virtualBalance = data.virtualBalance;
        currentBotState.isRunning = data.isRunning;

        // Actualización del balance visual
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${parseFloat(data.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // Lógica del botón: Sincronización con el progreso de sincronización del mercado
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

    // Decisiones Neurales (Confianza y Logs en tiempo real)
    socket.on('ai-decision-update', (data) => {
        if (aiBotUI.updateConfidence) {
            aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        }
        
        if (aiBotUI.addLogEntry) {
            aiBotUI.addLogEntry(data.message, data.confidence);
        }
    });

    // Indicadores Técnicos (ADX / STOCH)
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

    // Historial de operaciones
    socket.on('ai-history-data', (history) => {
        aiBotUI.updateHistoryTable(history);
    });

    // Ejecución de órdenes
    socket.on('ai-order-executed', (order) => {
        showAiToast(order);
        playNeuralSound(order.side);
        socket.emit('get-ai-history'); 
    });
}

/**
 * Configura el botón de encendido/apagado usando la API REST
 */
function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    // Clonar para evitar acumulamiento de listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const action = currentBotState.isRunning ? 'stop' : 'start';

        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";
        newBtn.className = "w-full py-4 bg-gray-600 text-white rounded-2xl font-black text-xs animate-pulse cursor-wait";

        try {
            const response = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                // El servidor ahora toma el capital directamente de la DB guardada por el autoguardado
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ action: action })
            });

            const result = await response.json();

            if (result.success) {
                currentBotState.isRunning = result.isRunning;
                aiBotUI.setRunningStatus(result.isRunning);
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error("❌ Error API IA:", error);
            aiBotUI.setRunningStatus(currentBotState.isRunning);
            alert("Error de conexión con el núcleo de IA.");
        } finally {
            newBtn.disabled = false;
        }
    });
}

/**
 * Notificación visual tipo Toast
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
 * Feedback auditivo
 */
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
    } catch (e) { }
}