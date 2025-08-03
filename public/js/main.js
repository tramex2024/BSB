// public/js/main.js
import { setupNavTabs } from './modules/navigation.js';
import { displayLogMessage } from './modules/auth.js';
import { initializeAutobotView, clearAutobotView } from './modules/navigation.js'; // Importar desde navigation.js

// --- Constantes Globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL = 'BTC_USDT';

// --- Elementos del DOM ---
export let logMessageElement = null;

// Event listener principal para el DOM
document.addEventListener('DOMContentLoaded', () => {
    logMessageElement = document.getElementById('log-message');
    setupNavTabs();
});