// public/js/modules/appEvents.js

import { toggleAuthModal, setupAuthListeners } from './login.js';
import { handleLogout } from './logout.js';
import { toggleApiModal } from './login.js';
import { handleApiFormSubmit } from './api.js';

const loginLogoutIcon = document.getElementById('login-logout-icon');
const apiKeyIcon = document.getElementById('api-key-icon');
const apiForm = document.getElementById('api-form');
const logoutModal = document.getElementById('logout-modal');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
const loginCtaBtn = document.getElementById('login-cta-btn');

/**
 * Muestra u oculta el modal de logout.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
function toggleLogoutModal(show) {
    if (logoutModal) {
        logoutModal.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Actualiza el icono de login/logout basado en si hay un token de autenticación.
 */
export function updateLoginIcon() {
    const isLoggedIn = localStorage.getItem('authToken');
    if (loginLogoutIcon) {
        if (isLoggedIn) {
            loginLogoutIcon.classList.remove('fa-sign-in-alt');
            loginLogoutIcon.classList.add('fa-sign-out-alt');
            loginLogoutIcon.title = 'Logout';
        } else {
            loginLogoutIcon.classList.remove('fa-sign-out-alt');
            loginLogoutIcon.classList.add('fa-sign-in-alt');
            loginLogoutIcon.title = 'Login';
        }
    }
}

export function initializeAppEvents() {
    updateLoginIcon();

    setupAuthListeners(() => {
        // Callback después del login
        updateLoginIcon();
        // La lógica de la vista se maneja en navigation.js
    });

    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (localStorage.getItem('authToken')) {
                toggleLogoutModal(true);
            } else {
                toggleAuthModal(true);
            }
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            handleLogout();
            updateLoginIcon();
            toggleLogoutModal(false);
            // Redirigir a la vista de "logged out"
            const navTabs = document.querySelectorAll('.header-middle .nav-tab');
            navTabs.forEach(tab => tab.style.display = 'none');
            const loggedOutView = document.getElementById('logged-out-view');
            if(loggedOutView) loggedOutView.style.display = 'block';
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', () => {
            toggleLogoutModal(false);
        });
    }

    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!localStorage.getItem('authToken')) {
                alert("Please login first to configure API keys.");
                return;
            }
            toggleApiModal(true);
        });
    }
    
    if (loginCtaBtn) {
        loginCtaBtn.addEventListener('click', () => {
            toggleAuthModal(true);
        });
    }

    if (apiForm) apiForm.addEventListener('submit', handleApiFormSubmit);
}