// public/js/modules/bot.js

// Importaciones corregidas, solo importamos lo que necesitamos
import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL } from '../main.js';

let botState = { lstate: 'STOPPED', sstate: 'STOPPED' };
let botConfig = {};

// Las funciones para interactuar con los botones y el estado del bot
export function toggleBotState() {
    const startBtn = document.getElementById('start-btn');
    if (!startBtn) return;

    if (botState.lstate === 'STOPPED' && botState.sstate === 'STOPPED') {
        startBot();
        startBtn.textContent = 'STOP';
        startBtn.classList.remove('bg-green-600');
        startBtn.classList.add('bg-red-600');
    } else {
        stopBot();
        startBtn.textContent = 'START';
        startBtn.classList.remove('bg-red-600');
        startBtn.classList.add('bg-green-600');
    }
}

async function startBot() {
    // Obtener los elementos del DOM en el momento de la ejecución
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");

    if (!purchaseInput || !incrementInput || !decrementInput || !triggerInput) {
        displayLogMessage("Error: Missing bot configuration elements.", 'error');
        return;
    }

    botConfig = {
        symbol: TRADE_SYMBOL,
        purchase: parseFloat(purchaseInput.value),
        increment: parseFloat(incrementInput.value),
        decrement: parseFloat(decrementInput.value),
        trigger: parseFloat(triggerInput.value)
    };

    try {
        const response = await fetchFromBackend('/start-bot', 'POST', botConfig);
        if (response.success) {
            botState = { lstate: 'STARTED', sstate: 'STARTED' };
            displayBotState();
            displayLogMessage("Bot started successfully!", 'success');
        } else {
            displayLogMessage(`Error starting bot: ${response.message}`, 'error');
        }
    } catch (error) {
        // El error ya se maneja en fetchFromBackend
    }
}

async function stopBot() {
    try {
        const response = await fetchFromBackend('/stop-bot', 'POST', { symbol: TRADE_SYMBOL });
        if (response.success) {
            botState = { lstate: 'STOPPED', sstate: 'STOPPED' };
            displayBotState();
            displayLogMessage("Bot stopped successfully!", 'success');
        } else {
            displayLogMessage(`Error stopping bot: ${response.message}`, 'error');
        }
    } catch (error) {
        // El error ya se maneja en fetchFromBackend
    }
}

export async function resetBot() {
    const resetBtn = document.getElementById('reset-btn');
    if (!resetBtn) return;

    try {
        const response = await fetchFromBackend('/reset-bot', 'POST', { symbol: TRADE_SYMBOL });
        if (response.success) {
            botState = { lstate: 'STOPPED', sstate: 'STOPPED' };
            displayBotState();
            displayLogMessage("Bot reset successfully!", 'success');
        } else {
            displayLogMessage(`Error resetting bot: ${response.message}`, 'error');
        }
    } catch (error) {
        // El error ya se maneja en fetchFromBackend
    }
}

export function displayBotState() {
    // Obtener los elementos del DOM en el momento de la ejecución
    const botLongStateDisplay = document.getElementById('bot-lstate');
    const botShortStateDisplay = document.getElementById('bot-sstate');

    if (botLongStateDisplay) botLongStateDisplay.textContent = botState.lstate;
    if (botShortStateDisplay) botShortStateDisplay.textContent = botState.sstate;
}