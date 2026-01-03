// public/js/modules/appEvents.js (CORREGIDO)

import { toggleAuthModal, handleAuthSubmit } from './login.js';
import { handleLogout } from './logout.js';

export function updateLoginIcon() {
    const icon = document.getElementById('login-logout-icon');
    if (!icon) return;
    
    const isLoggedIn = !!localStorage.getItem('token');
    icon.className = isLoggedIn ? 'fas fa-sign-out-alt cursor-pointer' : 'fas fa-sign-in-alt cursor-pointer';
    icon.title = isLoggedIn ? 'Logout' : 'Login';
}

export function initializeAppEvents(onLoginSuccess) {
    const loginIcon = document.getElementById('login-logout-icon');
    const authForm = document.getElementById('auth-form');

    // Manejo del Icono (Entrar o Salir)
    if (loginIcon) {
        loginIcon.addEventListener('click', () => {
            if (localStorage.getItem('token')) {
                if (confirm('Do you want to logout?')) handleLogout();
            } else {
                toggleAuthModal(true);
            }
        });
    }

    // Manejo del Formulario (Continue / Verify)
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthSubmit(onLoginSuccess);
        });
    }

    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('auth-modal');
        if (e.target === modal) toggleAuthModal(false);
    });
}