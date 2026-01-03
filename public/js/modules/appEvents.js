// public/js/modules/appEvents.js (CORREGIDO)

import { toggleAuthModal, handleAuthSubmit } from './login.js';
import { handleLogout } from './logout.js';
import { handleApiFormSubmit } from './api.js'; // Importación necesaria

export function updateLoginIcon() {
    const icon = document.getElementById('login-logout-icon');
    if (!icon) return;
    
    const token = localStorage.getItem('token');
    // Si hay token, flecha hacia afuera (sign-out). Si no, hacia adentro (sign-in).
    if (token) {
        icon.className = 'fas fa-sign-out-alt cursor-pointer hover:text-white transition';
        icon.title = 'Cerrar Sesión';
    } else {
        icon.className = 'fas fa-sign-in-alt cursor-pointer hover:text-white transition';
        icon.title = 'Iniciar Sesión';
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

    // --- EVENTOS DE LOGIN / LOGOUT ---
    if (loginIcon) {
        loginIcon.addEventListener('click', () => {
            if (localStorage.getItem('token')) {
                if (confirm('¿Deseas cerrar la sesión?')) handleLogout();
            } else {
                toggleAuthModal(true);
            }
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
} // <--- ESTA ES LA LLAVE QUE FALTABA