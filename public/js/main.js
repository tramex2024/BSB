// public/js/main.js
import { setupNavTabs } from './modules/navigation.js';
import { displayLogMessage } from './modules/auth.js';

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

// Nota: A partir de aquí, las funciones y variables específicas de las vistas
// (como las del Autobot) serán manejadas dentro del archivo navigation.js o en módulos
// específicos para cada vista, pero no en main.js.