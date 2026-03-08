/**
 * botControls.js - Gestor Centralizado de Comandos
 * Maneja la lógica de clics, confirmaciones y estados de carga.
 */
import { askConfirmation } from './confirmModal.js';
import { updateBotUI } from './uiManager.js';
import { displayMessage } from './ui/notifications.js';
import { currentBotState, BACKEND_URL, logStatus } from '../main.js';

export function initializeGlobalButtonListeners() {
    document.addEventListener('click', async (e) => {
        // 1. Identificación de botones
        const btnAi = e.target.closest('#btn-start-ai, #btn-stop-ai, #austartai-btn, #austopai-btn');
        const btnLong = e.target.closest('#austartl-btn, #austopl-btn');
        const btnShort = e.target.closest('#austarts-btn, #austops-btn');

        if (!btnAi && !btnLong && !btnShort) return;

        e.preventDefault();
        e.stopPropagation();

        const btn = btnAi || btnLong || btnShort;
        if (btn.disabled) return;

        let side, stateKey, endpoint;

        if (btnAi) {
            side = 'AI'; stateKey = 'aistate'; endpoint = '/api/ai/toggle';
        } else if (btnLong) {
            side = 'long'; stateKey = 'lstate'; endpoint = '/api/v1/config/update-config';
        } else if (btnShort) {
            side = 'short'; stateKey = 'sstate'; endpoint = '/api/v1/config/update-config';
        }

        const isRunning = currentBotState[stateKey] === 'RUNNING';
        const action = isRunning ? 'stop' : 'start';

        // 2. Modal de Confirmación
        const confirmado = await askConfirmation(side, action);
        if (!confirmado) return;

        // 3. UI: Estado de Carga
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
                // Actualizar estado global persistente
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
                
                // Forzar refresco de UI (Esto quita el spinner si el ID del botón cambia)
                await updateBotUI(currentBotState); 
            } else {
                throw new Error(result.message || "Error en la operación");
            }
        } catch (error) {
            console.error(`❌ Error en ${side}:`, error);
            logStatus(error.message, "error");
            btn.innerHTML = originalHTML; // Restaurar texto original solo en error
        } finally {
            btn.disabled = false;
            // Limpieza de seguridad final por si el DOM no se refrescó a tiempo
            if (btn.querySelector('.fa-spin')) {
                btn.innerHTML = originalHTML;
            }
        }
    });
}