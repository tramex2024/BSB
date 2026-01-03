// public/js/modules/appEvents.js (CORREGIDO)

import { toggleAuthModal, handleAuthSubmit } from './login.js';
import { handleLogout } from './logout.js';

export function updateLoginIcon() {
    const icon = document.getElementById('login-logout-icon');
    if (!icon) return;
    const isLoggedIn = !!localStorage.getItem('token');
    icon.className = `fas ${isLoggedIn ? 'fa-sign-out-alt' : 'fa-sign-in-alt'} cursor-pointer hover:text-white transition`;
    icon.title = isLoggedIn ? 'Cerrar Sesión' : 'Iniciar Sesión';
}

export function initializeAppEvents(onLoginSuccess) {
    const apiKeyIcon = document.getElementById('api-key-icon');
const apiModal = document.getElementById('api-modal');
const closeApiBtn = document.getElementById('close-api-modal');
const apiForm = document.getElementById('api-form');

// Abrir modal de API
if (apiKeyIcon) {
    apiKeyIcon.addEventListener('click', () => {
        if (!localStorage.getItem('token')) {
            alert("Por favor, inicia sesión primero.");
            return;
        }
        if (apiModal) apiModal.style.display = 'flex';
    });
}

// Cerrar modal de API
if (closeApiBtn) {
    closeApiBtn.addEventListener('click', () => {
        if (apiModal) apiModal.style.display = 'none';
    });
}

// Escuchar el submit del formulario de API
if (apiForm) {
    apiForm.addEventListener('submit', handleApiFormSubmit);
}