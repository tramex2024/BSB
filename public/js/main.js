/**
 * main.js - Núcleo Central del Sistema 2026
 * Orquestador de módulos y estado global.
 */
import { loadContent } from './modules/navigation.js';
import { initSocket } from './modules/socket.js';

// --- CONFIGURACIÓN GLOBAL ---
export const BACKEND_URL = window.location.origin;
export const TRADE_SYMBOL_TV = "BINANCE:BTCUSDT";

// Estado compartido por toda la aplicación
export let currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aistate: 'STOPPED',
    config: {
        long: { enabled: false },
        short: { enabled: false },
        ai: { enabled: false }
    }
};

/**
 * Inicialización de la Aplicación
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Neural Bot 2026: Iniciando...");
    
    // 1. Inicializar la conexión en tiempo real vía Socket.js
    // El socket se exporta desde socket.js si otros módulos lo necesitan
    initSocket();

    // 2. Manejar Navegación Inicial
    // Recuperamos la última pestaña visitada o vamos al dashboard por defecto
    const lastPage = localStorage.getItem('last_page') || 'dashboard';
    loadContent(lastPage);

    // 3. Listeners de Navegación para los tabs
    // Nota: Asegúrate de que tus enlaces tengan la clase 'nav-tab' o 'nav-link'
    document.querySelectorAll('.nav-tab, .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const page = e.currentTarget.getAttribute('data-tab') || e.currentTarget.getAttribute('data-page');
            if (page) loadContent(page);
        });
    });
});

/**
 * Logger visual para el estado de conexión y mensajes rápidos
 */
export function logStatus(msg, type = 'info') {
    const statusEl = document.getElementById('connection-status');
    const logMsgEl = document.getElementById('log-message');

    // Actualizar el texto de estado en el header
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.className = `text-[10px] font-bold ${
            type === 'success' ? 'text-emerald-500' : 
            type === 'error' ? 'text-rose-500' : 'text-gray-400'
        }`;
    }

    // Actualizar la barra de log inferior
    if (logMsgEl) {
        logMsgEl.textContent = msg;
        logMsgEl.className = type === 'error' ? 'text-rose-400' : 'text-gray-300';
    }
}