// public/js/modules/bot.js

import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL_BITMART } from '../main.js';
import { BACKEND_URL } from '../main.js'; // Importa la URL del backend

let isRunning = false;

// --- Nueva función para interactuar con el botón START/STOP
export async function toggleBotState() {
    const austartBtn = document.getElementById('austart-btn');
    if (!austartBtn) return;
    
    // Almacenamos el estado actual del botón antes de cambiarlo
    const currentState = austartBtn.textContent;
    const isStarting = currentState === 'START';
    const endpoint = isStarting ? '/api/autobot/start' : '/api/autobot/stop';

    austartBtn.textContent = isStarting ? 'Starting...' : 'Stopping...';
    austartBtn.disabled = true;

    try {
        // Hacemos la llamada al backend con el endpoint correcto
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to toggle bot state.');
        }

        const data = await response.json();
        displayLogMessage(data.message, 'success');
        
        // ¡Corrección clave! Después de la respuesta exitosa,
        // esperamos que la función checkBotStatus actualice el botón correctamente
        // ya que el estado se ha guardado en el backend.
        
    } catch (error) {
        console.error('Error toggling bot state:', error);
        displayLogMessage(`Error: ${error.message}`, 'error');
        
        // En caso de error, restauramos el botón a su estado original
        austartBtn.textContent = currentState;
    } finally {
        austartBtn.disabled = false;
        // Llamamos a esta función para asegurar que el estado visual se sincronice con el backend
        checkBotStatus();
    }
}

// --- Las otras funciones de gestión del bot ---

export async function loadBotConfigAndState() {
    displayLogMessage('Cargando configuración y estado del bot...', 'info');

    try {
        const botData = await fetchFromBackend('/api/user/bot-config-and-state');
        if (botData) {
            const purchaseInput = document.getElementById("aupurchase-usdt"); // Asumo que es el input correcto para autobot
            const incrementInput = document.getElementById("auincrement");
            const decrementInput = document.getElementById("audecrement");
            const triggerInput = document.getElementById("autrigger");
            const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');

            // Asumiendo que el backend te devuelve la configuración
            if (purchaseInput) purchaseInput.value = botData.purchase || 5.00;
            if (incrementInput) incrementInput.value = botData.increment || 100;
            if (decrementInput) decrementInput.value = botData.decrement || 1.0;
            if (triggerInput) triggerInput.value = botData.trigger || 1.5;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = botData.stopAtCycleEnd || false;
            
            // La función `checkBotStatus` se encargará de actualizar el estado del botón
            displayLogMessage(`Bot configuration loaded.`, 'success');
        } else {
            displayLogMessage('Failed to load bot configuration. Using default UI values.', 'warning');
        }
    } catch (error) {
        displayLogMessage(`Error loading bot config: ${error.message}`, 'error');
    }
}


export async function checkBotStatus() {
    const austartBtn = document.getElementById('austart-btn');
    if (!austartBtn) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/user/bot-config-and-state`);
        if (!response.ok) {
            throw new Error('Failed to fetch bot status');
        }
        const data = await response.json();
        
        // Si al menos una de las estrategias está corriendo, el botón debe ser "STOP"
        if (data.lstate === 'RUNNING' || data.sstate === 'RUNNING') {
            austartBtn.textContent = 'STOP';
            austartBtn.classList.remove('bg-green-600');
            austartBtn.classList.add('bg-red-600');
        } else {
            austartBtn.textContent = 'START';
            austartBtn.classList.remove('bg-red-600');
            austartBtn.classList.add('bg-green-600');
        }
    } catch (error) {
        console.error('Error fetching bot status:', error);
        // En caso de error, el botón vuelve a START por seguridad
        austartBtn.textContent = 'START';
        austartBtn.classList.remove('bg-red-600');
        austartBtn.classList.add('bg-green-600');
    }
}

export async function resetBot() {
    // Aquí puedes agregar la lógica para enviar una solicitud de "reset" al backend
    // por ahora, solo reseteamos los valores del UI
    const purchaseInput = document.getElementById("aupurchase-usdt");
    const incrementInput = document.getElementById("auincrement");
    const decrementInput = document.getElementById("audecrement");
    const triggerInput = document.getElementById("autrigger");
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    
    if (purchaseInput) purchaseInput.value = 5.00;
    if (incrementInput) incrementInput.value = 100;
    if (decrementInput) decrementInput.value = 1.0;
    if (triggerInput) triggerInput.value = 1.5;
    if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = false;

    displayLogMessage('Bot parameters reset to default values.', 'info');
}