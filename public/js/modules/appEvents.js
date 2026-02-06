// public/js/modules/appEvents.js (CORREGIDO)

import { toggleAuthModal, handleAuthSubmit } from './login.js';
import { handleLogout } from './logout.js';
import { handleApiFormSubmit } from './api.js';

export function updateLoginIcon() {
    const icon = document.getElementById('login-logout-icon');
    if (!icon) return;
    
    const token = localStorage.getItem('token');
    if (token) {
        icon.className = 'fas fa-sign-out-alt cursor-pointer text-emerald-500 hover:text-red-400 transition';
        icon.title = 'Sign Out'; // Texto en inglés
    } else {
        icon.className = 'fas fa-sign-in-alt cursor-pointer hover:text-white transition';
        icon.title = 'Sign In'; // Texto en inglés
    }
}

export function initializeAppEvents(onLoginSuccess) {
    const loginIcon = document.getElementById('login-logout-icon');
    const authForm = document.getElementById('auth-form');
    const closeAuthBtn = document.getElementById('close-auth-modal');
    
    const apiKeyIcon = document.getElementById('api-key-icon');
    const apiModal = document.getElementById('api-modal');
    const closeApiBtn = document.getElementById('close-api-modal');
    const apiForm = document.getElementById('api-form');

    // Elementos del Modal de Logout
    const logoutModal = document.getElementById('logout-modal');
    const confirmLogoutBtn = document.getElementById('confirm-logout');
    const cancelLogoutBtn = document.getElementById('cancel-logout');

    // --- EVENTOS DE LOGIN / LOGOUT ---
    if (loginIcon) {
        loginIcon.addEventListener('click', () => {
            if (localStorage.getItem('token')) {
                // En lugar de confirm(), mostramos el modal moderno
                if (logoutModal) logoutModal.style.display = 'flex';
            } else {
                toggleAuthModal(true);
            }
        });
    }

    // Confirmar cierre de sesión
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            if (logoutModal) logoutModal.style.display = 'none';
            handleLogout();
        });
    }

    // Cancelar cierre de sesión
    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', () => {
            if (logoutModal) logoutModal.style.display = 'none';
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthSubmit(onLoginSuccess);
        });
    }

    if (closeAuthBtn) {
        closeAuthBtn.addEventListener('click', () => toggleAuthModal(false));
    }

    // --- EVENTOS DE API ---
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!localStorage.getItem('token')) {
                alert("Por favor, inicia sesión primero.");
                return;
            }
            if (apiModal) apiModal.style.display = 'flex';
        });
    }

    if (closeApiBtn) {
        closeApiBtn.addEventListener('click', () => {
            if (apiModal) apiModal.style.display = 'none';
        });
    }

    if (apiForm) {
        apiForm.addEventListener('submit', handleApiFormSubmit);
    }

    // Cerrar modales al hacer clic fuera del contenido
    window.addEventListener('click', (e) => {
        if (e.target === apiModal) apiModal.style.display = 'none';
        if (e.target === logoutModal) logoutModal.style.display = 'none';
        // El de auth suele manejarse por su propia función toggle
    });
}