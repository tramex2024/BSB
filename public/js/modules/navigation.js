// public/js/modules/navigation.js

import { toggleAuthModal } from './login.js';

/**
 * Gestiona el cambio de pestañas y protege las rutas privadas.
 * @param {Function} callback - Función initializeTab que viene de main.js
 */
export function setupNavTabs(callback) {
    const navTabs = document.querySelectorAll('.nav-tab');
    const logMessageEl = document.getElementById('log-message');
    
    /**
     * Función interna para manejar el flujo de cambio de vista
     */
    async function loadContent(tabName) {
        const token = localStorage.getItem('token');
        
        // --- 1. CONTROL DE SEGURIDAD ---
        // Si el usuario intenta entrar a secciones privadas (autobot/aibot) sin estar logueado
        if (tabName !== 'dashboard' && !token) {
            // Revertimos el estilo visual a la pestaña dashboard
            navTabs.forEach(t => t.classList.remove('active'));
            const dashTab = document.querySelector('.nav-tab[data-tab="dashboard"]');
            if (dashTab) dashTab.classList.add('active');
            
            // Abrimos el modal de login automáticamente
            toggleAuthModal(true);
            
            if (logMessageEl) {
                logMessageEl.textContent = 'Acceso restringido: Inicia sesión para usar los Bots.';
                logMessageEl.className = 'text-red-400';
            }
            return; 
        }

        // --- 2. NOTIFICAR AL MOTOR PRINCIPAL (main.js) ---
        // Delegamos la carga del HTML y el JS al callback para evitar doble carga
        if (callback) {
            await callback(tabName);
        }

        // --- 3. ACTUALIZAR URL ---
        // Esto permite que si refrescas la página, se quede en la misma pestaña
        window.location.hash = tabName;
    }

    // Configurar el evento click para cada pestaña del menú
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.dataset.tab;
            
            // Cambiar visualmente la pestaña activa en el menú
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            loadContent(tabName);
        });
    });

    // --- MANEJO DE CARGA INICIAL (Refresh) ---
    // Detectar si venimos de un #hash específico (ej: #autobot)
    const currentHash = window.location.hash.replace('#', '');
    const initialTab = currentHash || 'dashboard';
    
    // Sincronizar estilos del menú al arrancar
    navTabs.forEach(t => {
        if (t.dataset.tab === initialTab) t.classList.add('active');
        else t.classList.remove('active');
    });

    // Cargar la pestaña correspondiente al iniciar
    loadContent(initialTab);
}