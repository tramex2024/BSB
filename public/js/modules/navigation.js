import { toggleAuthModal } from './login.js';

/**
 * Gestiona el cambio de pestañas y protege las rutas privadas.
 * @param {Function} callback - Función initializeTab de main.js
 */
export function setupNavTabs(callback) {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');
    const logMessageEl = document.getElementById('log-message');
    
    async function loadContent(tabName) {
        const token = localStorage.getItem('token');
        
        // --- CONTROL DE ACCESO ---
        // Si intenta ir a autobot o aibot sin token, lo mandamos al dashboard
        if (tabName !== 'dashboard' && !token) {
            navTabs.forEach(t => t.classList.remove('active'));
            const dashTab = document.querySelector('.nav-tab[data-tab="dashboard"]');
            if (dashTab) dashTab.classList.add('active');
            
            toggleAuthModal(true);
            
            if (logMessageEl) {
                logMessageEl.textContent = 'Acceso restringido: Inicia sesión para usar los Bots.';
                logMessageEl.className = 'text-red-400';
            }
            return; 
        }

        try {
            // 1. Cargar el HTML de la vista
            const response = await fetch(`./${tabName}.html`);
            if (!response.ok) throw new Error(`Vista no encontrada: ${tabName}`);
            const htmlContent = await response.text();
            
            // 2. Inyectar en el contenedor principal
            if (mainContent) {
                mainContent.innerHTML = htmlContent;
            }
            
            // 3. Notificar a main.js para que cargue el módulo JS de la vista
            if (callback) {
                await callback(tabName);
            }

            // 4. Sincronizar el Hash de la URL
            window.location.hash = tabName;

        } catch (error) {
            console.error('Navigation Error:', error);
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-10 text-center text-red-500">Error cargando vista: ${tabName}</div>`;
            }
        }
    }

    // Configurar el evento click para cada pestaña
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.dataset.tab;
            
            // UI: Cambiar pestaña activa
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            loadContent(tabName);
        });
    });

    // Carga inicial (al refrescar la página)
    const currentHash = window.location.hash.replace('#', '');
    const initialTab = currentHash || 'dashboard';
    
    // Asegurar que la pestaña correcta tenga el estilo 'active' al iniciar
    navTabs.forEach(t => {
        if (t.dataset.tab === initialTab) t.classList.add('active');
        else t.classList.remove('active');
    });

    loadContent(initialTab);
}