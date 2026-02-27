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
        const userStr = localStorage.getItem('user');
        let userRole = 'current';

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                userRole = user.role || 'current';
            } catch (e) {
                console.error("Error parsing user role in navigation", e);
            }
        }
        
        // --- 1. CONTROL DE SEGURIDAD (TOKEN) ---
        if (tabName !== 'dashboard' && !token) {
            revertToDashboard();
            toggleAuthModal(true);
            showErrorLog('Acceso restringido: Inicia sesión para usar los Bots.');
            return; 
        }

        // --- 2. CONTROL DE SEGURIDAD (ROLES) [NUEVO] ---
        // Si el usuario es 'current' e intenta entrar a pestañas avanzadas
        const restrictedTabs = ['autobot', 'aibot'];
        if (userRole === 'current' && restrictedTabs.includes(tabName)) {
            console.warn(`[SECURITY] Bloqueado intento de acceso a ${tabName} por rol insuficiente.`);
            revertToDashboard();
            showErrorLog('Tu plan actual no permite acceso a esta función.');
            return;
        }

        // --- 3. NOTIFICAR AL MOTOR PRINCIPAL (main.js) ---
        if (callback) {
            await callback(tabName);
        }

        // --- 4. ACTUALIZAR URL ---
        window.location.hash = tabName;
    }

    // Funciones auxiliares para no repetir código
    function revertToDashboard() {
        navTabs.forEach(t => t.classList.remove('active'));
        const dashTab = document.querySelector('.nav-tab[data-tab="dashboard"]');
        if (dashTab) dashTab.classList.add('active');
        window.location.hash = 'dashboard';
    }

    function showErrorLog(msg) {
        if (logMessageEl) {
            logMessageEl.textContent = msg;
            logMessageEl.className = 'text-red-400 font-bold';
        }
    }

    // Configurar el evento click para cada pestaña del menú
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.dataset.tab;
            
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            loadContent(tabName);
        });
    });

    // --- MANEJO DE CARGA INICIAL (Refresh) ---
    const currentHash = window.location.hash.replace('#', '');
    const initialTab = currentHash || 'dashboard';
    
    navTabs.forEach(t => {
        if (t.dataset.tab === initialTab) t.classList.add('active');
        else t.classList.remove('active');
    });

    loadContent(initialTab);
}