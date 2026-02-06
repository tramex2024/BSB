// public/js/modules/appEvents.js (CORREGIDO)

import { toggleAuthModal, setupAuthListeners } from './login.js';
import { handleLogout } from './logout.js';
import { toggleApiModal } from './login.js';
import { handleApiFormSubmit } from './api.js';

// 🛑 ELIMINADAS: Variables globales de DOM.
// Ahora se declaran dentro de initializeAppEvents para garantizar que el DOM esté cargado.


/**
 * Muestra u oculta el modal de logout.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
function toggleLogoutModal(show) {
    // 💡 NOTA: logoutModal debe ser recuperado del DOM dentro de initializeAppEvents
    const logoutModal = document.getElementById('logout-modal');
    if (logoutModal) {
        logoutModal.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Actualiza el icono de login/logout basado en si hay un token de autenticación.
 */
export function updateLoginIcon() {
    // 💡 NOTA: loginLogoutIcon debe ser recuperado del DOM dentro de initializeAppEvents
    const loginLogoutIcon = document.getElementById('login-logout-icon');
    
    // CORRECCIÓN CLAVE: Usamos 'token'
    const isLoggedIn = localStorage.getItem('token');
    
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

/**
 * Configura los event listeners principales de la aplicación.
 * 🛑 CRÍTICO: Las referencias al DOM se obtienen AHORA.
 * @param {Function} onLoginSuccessCallback - Callback a ejecutar después de un login exitoso.
 */
export function initializeAppEvents(onLoginSuccessCallback) {
    
    // 1. OBTENCIÓN DE REFERENCIAS AL DOM (GARANTIZADO QUE EXISTEN AQUÍ)
    const loginLogoutIcon = document.getElementById('login-logout-icon');
    const apiKeyIcon = document.getElementById('api-key-icon');
    const apiForm = document.getElementById('api-form');
    // const logoutModal = document.getElementById('logout-modal'); // Lo dejamos en la función toggleLogoutModal
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
    const loginCtaBtn = document.getElementById('login-cta-btn'); // 👈 ESTE ES EL BOTÓN "Log in Now"
    
    updateLoginIcon(); // Llama a la versión mejorada

    // Ahora pasamos el callback de éxito al listener de autenticación
    setupAuthListeners(onLoginSuccessCallback);

    // --- Listeners Principales ---
    
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (localStorage.getItem('token')) {
                // Si hay token: Muestra modal de Logout
                toggleLogoutModal(true);
            } else {
                // Si no hay token: Muestra modal de Login
                toggleAuthModal(true); 
            }
        });
    }

    // El botón de Login/CTA en el Splash Screen (El que no funcionaba)
    if (loginCtaBtn) {
        loginCtaBtn.addEventListener('click', () => {
            // El CTA siempre debe mostrar el modal de Login/Auth
            toggleAuthModal(true);
        });
    }

    // --- Listeners de Modal de Logout ---

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            handleLogout();
            // Ya que handleLogout elimina el token, el icono se actualizará correctamente
            updateLoginIcon(); 
            toggleLogoutModal(false);
            window.location.reload();
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', () => {
            toggleLogoutModal(false);
        });
    }

    // --- Listener de API Key ---

    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!localStorage.getItem('token')) {
                alert("Please login first to configure API keys.");
                return;
            }
            toggleApiModal(true);
        });
    }
    
    if (apiForm) apiForm.addEventListener('submit', handleApiFormSubmit);
}