import { displayLogMessage } from './auth.js';

export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');

    // Función para cargar el contenido
    async function loadContent(tabName) {
        try {
            const response = await fetch(`/html/${tabName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html`);
            }
            const htmlContent = await response.text();
            mainContent.innerHTML = htmlContent;
            displayLogMessage(`Switched to ${tabName} tab.`, 'info');
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