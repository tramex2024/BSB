/**
 * navigation.js - SPA Router & Route Guard
 */
import { toggleAuthModal } from './login.js';

// Mapa de URLs de los fragmentos HTML
const TAB_SOURCES = {
    'dashboard': '/views/dashboard.html',
    'autobot': '/views/autobot.html',
    'aibot': '/views/aibot.html'
};

/**
 * Carga el contenido de una pestaña y protege rutas privadas
 */
export async function loadContent(tabName) {
    const mainContent = document.getElementById('main-content');
    const navTabs = document.querySelectorAll('.nav-tab');
    const logMessageEl = document.getElementById('log-message');
    const token = localStorage.getItem('token');

    if (!mainContent) return;

    // --- 1. ROUTE GUARD (Seguridad) ---
    if (tabName !== 'dashboard' && !token) {
        updateActiveTab('dashboard');
        toggleAuthModal(true);
        if (logMessageEl) {
            logMessageEl.textContent = '🔒 Acceso restringido: Inicia sesión para operar.';
            logMessageEl.className = 'text-amber-400 font-bold';
        }
        return;
    }

    // --- 2. CARGA DE CONTENIDO (Fetch HTML) ---
    try {
        // Mostrar mini-loader interno si se desea
        mainContent.innerHTML = `<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div>`;

        const response = await fetch(TAB_SOURCES[tabName] || TAB_SOURCES['dashboard']);
        if (!response.ok) throw new Error('Error al cargar la vista');
        
        const html = await response.text();
        mainContent.innerHTML = html;

        // --- 3. INICIALIZACIÓN DINÁMICA ---
        // Aquí podrías disparar eventos específicos por pestaña si fuera necesario
        window.location.hash = tabName;
        localStorage.setItem('last_page', tabName);
        updateActiveTab(tabName);

    } catch (error) {
        console.error("Navigation Error:", error);
        mainContent.innerHTML = `<div class="p-10 text-center text-rose-500">Error cargando componente: ${tabName}</div>`;
    }
}

/**
 * Actualiza visualmente los botones de la barra de navegación
 */
function updateActiveTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active', 'border-b-2', 'border-emerald-500', 'text-emerald-400');
        } else {
            tab.classList.remove('active', 'border-b-2', 'border-emerald-500', 'text-emerald-400');
        }
    });
}

/**
 * Configura los eventos iniciales
 */
export function initNavigation() {
    // Detectar clicks en el nav
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.tab;
            loadContent(target);
        });
    });

    // Manejar el botón de atrás/adelante del navegador
    window.addEventListener('popstate', () => {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        loadContent(hash);
    });
}