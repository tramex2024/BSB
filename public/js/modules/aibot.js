/**
 * aiBot.js - Controlador de la estrategia de Inteligencia Artificial (Versión Blindada 2026)
 * Estado: Auditado y Corregido - Remoción de clonaciones destructivas y sincronización reactiva inmediata
 */

import { currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { fetchOrders } from './orders.js';
import { displayMessage } from './uiManager.js';

/**
 * Gestiona los clics en las pestañas de filtros dentro de AIBOT
 */
function setupAiOrderTabs() {
    const tabs = document.querySelectorAll('.aibot-tabs button');
    const aiOrderCont = document.getElementById('ai-order-list');
    
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.onclick = null; // Limpiar eventos previos de forma segura sin romper el árbol del DOM

        tab.onclick = (e) => {
            const strategy = e.currentTarget.getAttribute('data-strategy') || 'ai';
            
            // Estilo visual de pestaña activa (Esmeralda para IA)
            tabs.forEach(t => t.classList.remove('active-tab-style', 'text-emerald-400', 'border-b-2', 'border-emerald-500'));
            e.currentTarget.classList.add('active-tab-style', 'text-emerald-400', 'border-b-2', 'border-emerald-500');

            if (aiOrderCont) {
                fetchOrders(strategy, aiOrderCont);
            }
        };
    });
}

/**
 * Inicializa la vista del AI Bot y sincroniza el estado global
 */
export function initializeAibotView() {
    console.log("🚀 AI System: Syncing card-style interface...");
    
    // BLINDAJE: Asegurar integridad estructural del objeto config
    if (!currentBotState.config) currentBotState.config = {};
    if (!currentBotState.config.ai) currentBotState.config.ai = { amountUsdt: 6.0, stopAtCycle: false };

    setupAIControls();
    
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) {
        aiInput.value = currentBotState.config.ai.amountUsdt || "";
    }
    if (stopAtCycleCheck) {
        stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle || false;
    }

    // Determinación precisa del estado basándonos en la arquitectura unificada
    const isAiRunning = currentBotState.aistate === 'RUNNING' || currentBotState.isRunning === true;

    if (aiBotUI) {
        aiBotUI.setRunningStatus(
            isAiRunning, 
            currentBotState.config.ai.stopAtCycle,
            currentBotState.historyCount || 0
        );
    }

    const aiOrderCont = document.getElementById('ai-order-list'); 
    if (aiOrderCont) {
        fetchOrders('ai', aiOrderCont);
        setupAiOrderTabs();
    }
}

/**
 * Configura los event listeners de los inputs de la IA
 */
function setupAIControls() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) {
        aiInput.onchange = async () => {
            const val = parseFloat(aiInput.value);
            if (isNaN(val) || val < 0) return;
            await saveAIConfig({ amountUsdt: val });
        };
    }

    if (stopCycleCheck) {
        stopCycleCheck.onchange = async () => {
            await saveAIConfig({ stopAtCycle: stopCycleCheck.checked });
        };
    }

    // [BLINDAJE 2026]: Eliminamos la clonación destructiva de btn-start-ai.
    // La delegación de su evento 'onclick' se centraliza limpiamente en botControls.js / main.js
    // para evitar romper las referencias globales del ciclo de vida de la SPA.
}

/**
 * Guarda la configuración de la IA sin corromper el resto de estrategias
 */
async function saveAIConfig(aiPayload) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(aiPayload) 
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Sincronización del valor REAL procesado por las reglas de negocio del backend
            if (data.amountUsdt !== undefined) {
                currentBotState.config.ai.amountUsdt = data.amountUsdt;
                const aiInput = document.getElementById('ai-amount-usdt');
                if (aiInput) aiInput.value = data.amountUsdt;
            }
            
            if (data.virtualBalance !== undefined) {
                currentBotState.aibalance = data.virtualBalance;
            }

            // PROPAGACIÓN REACTIVA: Forzamos al uiManager a redibujar el estado mutado instantáneamente
            const { updateBotUI } = await import('./uiManager.js');
            updateBotUI(currentBotState);

            displayMessage(data.message || "IA Sincronizada", "success");
        } else {
            displayMessage(data.message || "Error al actualizar", "error");
        }
    } catch (error) {
        console.error("❌ Error saving AI config:", error);
        displayMessage("Error de conexión", "error");
    }
}

/**
 * Notifications Visuales (Toasts de ejecución en tiempo real)
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
 * Sonido de ejecución (Feedback auditivo sintetizado)
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
    } catch (e) { /* Mitigar bloqueos de políticas de auto-play del navegador */ }
}