// public/js/modules/navigation.js (CORREGIDO)
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL } from '../main.js';
import { cargarPrecioEnVivo } from './network.js';

// --- Elementos del DOM ---
const navTabs = document.querySelectorAll('.nav-tab');
const mainContent = document.getElementById('main-content');

/**
 * Carga el contenido de la vista seleccionada de forma dinámica.
 * @param {string} viewName El nombre del archivo de la vista (ej. 'autobot.html').
 */
async function loadView(viewName) {
    try {
        const response = await fetch(`views/${viewName}`);
        if (!response.ok) {
            throw new Error(`Failed to load view: ${viewName}`);
        }
        mainContent.innerHTML = await response.text();
    } catch (error) {
        console.error('Error loading view:', error);
        mainContent.innerHTML = `<p class="text-red-500">Error loading page.</p>`;
    }
}

/**
 * Lógica para manejar el cambio de pestañas de navegación.
 */
function handleTabClick(event) {
    navTabs.forEach(tab => tab.classList.remove('active-tab'));
    const clickedTab = event.currentTarget;
    clickedTab.classList.add('active-tab');
    const view = clickedTab.dataset.view;
    if (view) {
        loadView(view);
    }
}

/**
 * Obtiene el precio de Bitcoin y lo muestra en el DOM.
 */
async function fetchAndDisplayTicker() {
    try {
        const tickerData = await fetchFromBackend(`/ticker/${TRADE_SYMBOL}`);
        if (tickerData && tickerData.last) {
            cargarPrecioEnVivo(tickerData.last);
        } else {
            cargarPrecioEnVivo(null); // Pasa null para mostrar 'N/A'
        }
    } catch (error) {
        // La función fetchFromBackend ya maneja el error y muestra el mensaje.
        cargarPrecioEnVivo(null); // Pasa null para mostrar 'N/A'
    }
}

/**
 * Configura los event listeners para las pestañas de navegación.
 * También inicia la obtención del precio al cargar la página.
 */
export function setupNavTabs() {
    navTabs.forEach(tab => {
        tab.addEventListener('click', handleTabClick);
    });

    // Inicia la obtención del precio al cargar la página
    fetchAndDisplayTicker();

    // Opcional: Actualizar el precio cada 10 segundos
    setInterval(fetchAndDisplayTicker, 10000);
}