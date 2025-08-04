// public/js/modules/navigation.js

import { displayLogMessage } from './auth.js';

export function setupNavTabs(callback) {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');
    
    async function loadContent(tabName) {
        try {
            const response = await fetch(`/${tabName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html`);
            }
            const htmlContent = await response.text();
            mainContent.innerHTML = htmlContent;
            displayLogMessage(`Switched to ${tabName} tab.`, 'info');

            const newUrl = window.location.origin + window.location.pathname + `?#${tabName}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            // Se ejecuta un callback después de cargar el contenido
            if (callback) {
                callback(tabName);
            }
        } catch (error) {
            console.error('Error loading content:', error);
            mainContent.innerHTML = `<p class="text-red-500">Error loading page content. Please try again.</p>`;
            displayLogMessage(`Error loading content for ${tabName}.`, 'error');
        }
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault();
            const tabName = this.dataset.tab;

            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            loadContent(tabName);
        });
    });

    // Cargar la pestaña inicial
    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) {
        loadContent(initialActiveTab.dataset.tab);
    } else {
        const defaultTab = 'dashboard';
        const defaultTabElement = document.querySelector(`.nav-tab[data-tab="${defaultTab}"]`);
        if (defaultTabElement) {
            defaultTabElement.classList.add('active');
            loadContent(defaultTab);
        }
    }
}