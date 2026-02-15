/**
 * File: public/js/modules/aibot.js
 * AI Core - View Management (Card Style Version 2026)
 * Integration: Unified Design Standard
 */

import { currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { fetchOrders } from './orders.js';

/**
 * Inicializa la vista de IA y sincroniza componentes
 */
export function initializeAibotView() {
    console.log("🚀 AI System: Syncing card-style interface...");
    
    // 1. Configurar listeners de inputs y botones
    setupAIControls();
    
    // 2. Sincronización de UI con el estado global
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput && currentBotState.config?.ai) {
        aiInput.value = currentBotState.config.ai.amountUsdt || "";
    }
    if (stopAtCycleCheck && currentBotState.config?.ai) {
        stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle || false;
    }

    aiBotUI.setRunningStatus(
        currentBotState.isRunning, 
        currentBotState.config?.ai?.stopAtCycle,
        currentBotState.historyCount || 0
    );

    // 3. CARGA DE ÓRDENES (UNIFICADO AL ESTILO CARD)
    // Usamos el contenedor div 'ai-order-list' en lugar de un tbody de tabla
    const aiOrderCont = document.getElementById('ai-order-list'); 
    if (aiOrderCont) {
        // Cargamos estrategia 'ai' usando el motor de orders.js
        fetchOrders('ai', aiOrderCont);
        setupAiOrderTabs(); // Inicializamos las pestañas internas si existen
    }
}

/**
 * Gestiona los clics en las pestañas de filtros dentro de AIBOT
 */
function setupAiOrderTabs() {
    const tabs = document.querySelectorAll('.aibot-tabs button');
    const aiOrderCont = document.getElementById('ai-order-list');
    
    tabs.forEach(tab => {
        tab.onclick = null; // Limpiar eventos previos

        tab.onclick = (e) => {
            // El status puede ser 'ai' (para órdenes abiertas) o 'all' (para historial)
            // según cómo tengas definido el data-strategy en tu HTML
            const strategy = e.currentTarget.getAttribute('data-strategy') || 'ai';
            
            // Estilo visual de pestaña activa (Emerald)
            tabs.forEach(t => t.classList.remove('active-tab-style', 'text-emerald-400', 'border-b-2', 'border-emerald-500'));
            e.currentTarget.classList.add('active-tab-style', 'text-emerald-400', 'border-b-2', 'border-emerald-500');

            // Llamamos a fetchOrders con el estilo unificado de 2 parámetros
            if (aiOrderCont) {
                fetchOrders(strategy, aiOrderCont);
            }
        };
    });
}

/**
 * Configuración de controles: Inputs, Checkboxes y Botón Principal
 */
function setupAIControls() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopCycleCheck = document.getElementById('ai-stop-at-cycle');
    const btnStartAi = document.getElementById('btn-start-ai');

    if (aiInput) {
        aiInput.onchange = async () => {
            const val = parseFloat(aiInput.value);
            if (isNaN(val) || val <= 0) return;
            await saveAIConfig({ amountUsdt: val });
        };
    }

    if (stopCycleCheck) {
        stopCycleCheck.onchange = async () => {
            await saveAIConfig({ stopAtCycle: stopCycleCheck.checked });
        };
    }

    if (btnStartAi) {
        const newBtn = btnStartAi.cloneNode(true);
        btnStartAi.parentNode.replaceChild(newBtn, btnStartAi);
        
        newBtn.addEventListener('click', async () => {
            const isCurrentlyEnabled = currentBotState.isRunning;
            const action = isCurrentlyEnabled ? 'stop' : 'start';
            
            newBtn.disabled = true;
            newBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

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
                    aiBotUI.setRunningStatus(
                        result.isRunning, 
                        currentBotState.config?.ai?.stopAtCycle,
                        currentBotState.historyCount || 0
                    );
                }
            } catch (error) {
                console.error("❌ AI Toggle Error:", error);
            } finally {
                newBtn.disabled = false;
            }
        });
    }
}

/**
 * Guarda la configuración de la IA en el backend
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
        if (data.success) {
            if (payload.amountUsdt !== undefined) currentBotState.config.ai.amountUsdt = payload.amountUsdt;
            if (payload.stopAtCycle !== undefined) currentBotState.config.ai.stopAtCycle = payload.stopAtCycle;

            if (aiBotUI.addLogEntry) {
                const key = Object.keys(payload)[0];
                const msg = key === 'stopAtCycle' 
                    ? `Smart Cycle: ${payload[key] ? 'ENABLED' : 'DISABLED'}`
                    : `AI: Capital updated to $${payload[key]}`;
                aiBotUI.addLogEntry(msg, 0.5);
            }
        }
    } catch (error) {
        console.error("❌ Error saving AI config:", error);
    }
}

/**
 * Notificaciones Visuales (Toasts)
 */
export function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-500 transform translate-y-0 ${
        isBuy ? 'bg-emerald-900/90 border-emerald-400' : 'bg-red-900/90 border-red-400'
    } text-white animate-bounceIn`;

    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="p-2 bg-white/10 rounded-full text-lg">${isBuy ? '🚀' : '💰'}</div>
            <div>
                <p class="text-[10px] font-bold uppercase tracking-tighter opacity-70">AI Core Execution</p>
                <p class="text-xs font-black">${order.side} BTC @ $${parseFloat(order.price).toLocaleString()}</p>
            </div>
        </div>`;

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Sonido de ejecución (Feedback auditivo)
 */
export function playNeuralSound(side) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
}