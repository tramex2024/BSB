// public/js/modules/navigation.js
import { displayLogMessage } from './auth.js';
import { initializeAutobotView, clearAutobotView } from '../main.js';

let currentActiveTab = null;

/**
 * Configura los event listeners para la navegación principal.
 */
export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');

    // Función para cargar el contenido
    async function loadContent(tabName) {
        try {
            // Cargar el contenido de la pestaña
            const response = await fetch(`/html/${tabName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html`);
            }
            const htmlContent = await response.text();
            mainContent.innerHTML = htmlContent;
            displayLogMessage(`Switched to ${tabName} tab.`, 'info');

            // Llamar a funciones de inicialización específicas de la vista
            if (tabName === 'autobot') {
                initializeAutobotView();
            } else {
                // Si salimos de la vista Autobot, limpiamos sus intervalos.
                if (currentActiveTab === 'autobot') {
                    clearAutobotView();
                }
            }
            currentActiveTab = tabName;

        } catch (error) {
            console.error('Error loading content:', error);
            mainContent.innerHTML = `<p class="text-red-500">Error loading page content. Please try again.</p>`;
            displayLogMessage(`Error loading content for ${tabName}.`, 'error');
        }
    }

    // Configurar el evento de clic para cada pestaña
    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault();
            const tabName = this.dataset.tab;

            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            loadContent(tabName);
        });
    });

    // Cargar el contenido de la pestaña activa al inicio
    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) {
        const initialTabName = initialActiveTab.dataset.tab;
        loadContent(initialTabName);
    }
}