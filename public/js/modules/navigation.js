import { displayLogMessage } from './auth.js';
import { toggleAuthModal } from './login.js';

export function setupNavTabs(callback) {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');
    
    async function loadContent(tabName) {
        const token = localStorage.getItem('token');
        
        // --- CONTROL DE ACCESO ---
        if (tabName !== 'dashboard' && !token) {
            navTabs.forEach(t => t.classList.remove('active'));
            document.querySelector('.nav-tab[data-tab="dashboard"]')?.classList.add('active');
            toggleAuthModal(true);
            displayLogMessage('Acceso denegado.', 'error', document.getElementById('log-message'));
            return; 
        }

        try {
            // 1. Cargar el HTML
            const response = await fetch(`./${tabName}.html`);
            if (!response.ok) throw new Error(`Error: ${tabName}`);
            const htmlContent = await response.text();
            
            // 2. Inyectar en el DOM
            mainContent.innerHTML = htmlContent;
            
            // 3. Notificar al sistema que la vista cambió (Esto reconecta el JS)
            if (callback) {
                await callback(tabName);
            }

            // 4. Actualizar URL
            window.location.hash = tabName;

        } catch (error) {
            console.error('Error:', error);
            mainContent.innerHTML = `<p class="p-4 text-red-500">Error cargando ${tabName}</p>`;
        }
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.dataset.tab;
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadContent(tabName);
        });
    });

    // Carga inicial basada en hash o dashboard
    const initialTab = window.location.hash.replace('#', '') || 'dashboard';
    loadContent(initialTab);
}