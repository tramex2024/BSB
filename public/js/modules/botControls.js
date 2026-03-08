/**
 * botControls.js - Gestor Centralizado de Comandos
 */
import { askConfirmation } from './confirmModal.js';
import { updateBotUI } from './uiManager.js';
import { displayMessage } from './ui/notifications.js';
import { currentBotState, BACKEND_URL, logStatus } from '../main.js';

export function initializeGlobalButtonListeners() {
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('#btn-start-ai, #btn-stop-ai, #austartai-btn, #austopai-btn, #austartl-btn, #austopl-btn, #austarts-btn, #austops-btn, #panic-btn');

        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        if (target.disabled) return;

        // --- CASO ESPECIAL: PANIC STOP ---
        if (target.id === 'panic-btn') {
            await handlePanicStop(target);
            return;
        }

        // --- CASO NORMAL: START/STOP INDIVIDUAL ---
        await handleToggleBot(target);
    });
}

/**
 * Lógica de Panic Stop dentro de botControls.js
 */
async function handlePanicStop(btn) {
    // 1. MODAL DE CONFIRMACIÓN CRÍTICA
    // Enviamos 'ALL BOTS' como side y 'STOP (PANIC)' como acción
    const confirmado = await askConfirmation('ALL BOTS', 'STOP (PANIC)');
    
    // Si el usuario cancela o cierra el modal, salimos sin hacer nada
    if (!confirmado) return;

    // 2. EJECUCIÓN (Si confirmó)
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    
    // Cambio visual agresivo para indicar que el sistema está respondiendo
    btn.classList.add('bg-red-700', 'scale-95');
    btn.innerHTML = `<i class="fas fa-radiation fa-spin mr-2"></i> EXECUTING EMERGENCY STOP...`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/autobot/panic-stop`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.success) {
            // Sincronización forzada del estado global
            currentBotState.lstate = 'STOPPED';
            currentBotState.sstate = 'STOPPED';
            currentBotState.aistate = 'STOPPED';
            currentBotState.isRunning = false;

            logStatus("🚨 SYSTEM HALTED: All bots and positions stopped.", "error");
            displayMessage("EMERGENCY STOP EXECUTED", "error");
            
            // Refrescar toda la UI para mostrar los botones en rojo/stop
            await updateBotUI(currentBotState);
        } else {
            throw new Error(result.message || "Panic command failed");
        }
    } catch (error) {
        console.error("❌ Panic Error:", error);
        logStatus("PANIC FAILED: " + error.message, "error");
        btn.innerHTML = originalHTML;
    } finally {
        btn.disabled = false;
        btn.classList.remove('bg-red-700', 'scale-95');
    }
}

async function handleToggleBot(btn) {
    // ... (Aquí va la lógica que ya teníamos para Start/Stop individual) ...
    // Asegúrate de mantener el bloque try/catch/finally que hicimos antes
    let side, stateKey, endpoint;
    const id = btn.id;

    if (id.includes('ai')) {
        side = 'AI'; stateKey = 'aistate'; endpoint = '/api/ai/toggle';
    } else if (id.includes('l-btn')) {
        side = 'long'; stateKey = 'lstate'; endpoint = '/api/v1/config/update-config';
    } else if (id.includes('s-btn')) {
        side = 'short'; stateKey = 'sstate'; endpoint = '/api/v1/config/update-config';
    }

    const isRunning = currentBotState[stateKey] === 'RUNNING';
    const action = isRunning ? 'stop' : 'start';

    const confirmado = await askConfirmation(side, action);
    if (!confirmado) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

    try {
        let bodyPayload;
        let finalEndpoint = endpoint; 

        if (side === 'AI') {
            bodyPayload = { action, side: side.toLowerCase() };
        } else {
            const sideLow = side.toLowerCase();
            finalEndpoint = `/api/autobot/${action}/${sideLow}`;
            bodyPayload = { strategy: sideLow, config: { [sideLow]: { enabled: action === 'start' } } };
        }

        const response = await fetch(`${BACKEND_URL}${finalEndpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(bodyPayload) 
        });

        const result = await response.json();
        
        if (result.success) {
            if (side === 'AI') {
                currentBotState.aistate = result.aistate;
                currentBotState.isRunning = result.isRunning;
            } else {
                currentBotState[stateKey] = (action === 'start' ? 'RUNNING' : 'STOPPED');
            }
            logStatus(`${side.toUpperCase()} ${action.toUpperCase()} exitoso`, "success");
            displayMessage(`Estrategia ${side.toUpperCase()}: ${action.toUpperCase()}`, action === 'start' ? 'success' : 'warning');
            await updateBotUI(currentBotState); 
        } else {
            throw new Error(result.message || "Error");
        }
    } catch (error) {
        logStatus(error.message, "error");
        btn.innerHTML = originalHTML;
    } finally {
        btn.disabled = false;
        if (btn.querySelector('.fa-spin')) btn.innerHTML = originalHTML;
    }
}