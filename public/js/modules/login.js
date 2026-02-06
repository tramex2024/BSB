// public/js/modules/login.js

import { BACKEND_URL } from '../main.js';
import { displayLogMessage } from './auth.js';
import { updateLoginIcon } from './appEvents.js';

// --- Constantes del DOM (NO MODIFICAR) ---
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const tokenInput = document.getElementById('token');
const emailSection = document.getElementById('email-section');
const tokenSection = document.getElementById('token-section');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');
const apiModal = document.getElementById('api-modal');

/**
 * Muestra u oculta el modal de autenticación (login/registro).
 * Reinicia el formulario al abrir.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
export function toggleAuthModal(show) {
    if (authModal) {
        if (show) {
            if (authForm) {
                authForm.reset();
            }
            if (authButton) {
                authButton.textContent = 'Continue';
            }
            if (authMessage) {
                authMessage.textContent = '';
                authMessage.className = '';
            }
            if (emailInput) {
                emailInput.value = '';
                emailInput.disabled = false;
            }
            if (tokenInput) {
                tokenInput.value = '';
            }
            if (emailSection) emailSection.style.display = 'block';
            if (tokenSection) tokenSection.style.display = 'none';
            authModal.style.display = 'flex';
        } else {
            authModal.style.display = 'none';
        }
    }
}

/**
 * Muestra u oculta el modal de configuración de API.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
export function toggleApiModal(show) {
    if (apiModal) {
        if (show) {
            apiModal.style.display = 'flex';
        } else {
            apiModal.style.display = 'none';
        }
    }
}

/**
 * Maneja el submit del formulario de autenticación.
 * @param {Event} e El evento de submit.
 * @param {Function} onLoginSuccess Callback a ejecutar después de un login exitoso.
 */
export async function handleAuthFormSubmit(e, onLoginSuccess) {
    e.preventDefault();
    const email = emailInput.value;
    const token = tokenInput.value;
    
    if (authMessage) authMessage.textContent = 'Processing...';
    if (authMessage) authMessage.className = 'text-yellow-500';

    try {
        let response;
        let data;
        
        if (tokenSection.style.display === 'none') {
            response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            data = await response.json();

            if (response.ok) {
                if (authMessage) authMessage.textContent = data.message;
                if (authMessage) authMessage.className = 'text-green-500';
                if (emailInput) emailInput.disabled = true;
                if (tokenSection) tokenSection.style.display = 'block';
                if (authButton) authButton.textContent = 'Verify Token';
            } else {
                if (authMessage) authMessage.textContent = data.error || 'Server error. Please try again later.';
                if (authMessage) authMessage.className = 'text-red-500';
            }
        } else {
            response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, token })
            });
            data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userEmail', email);

                if (authMessage) {
                    authMessage.textContent = data.message;
                    authMessage.className = 'text-green-500';
                }
                
                // --- CORRECCIÓN CLAVE AQUÍ ---
                // Llama a la función de inicialización INMEDIATAMENTE
                // después de guardar el token.
                if (onLoginSuccess) {
                    onLoginSuccess();
                }

                // El temporizador es solo para cerrar el modal
                setTimeout(() => {
                    toggleAuthModal(false);
                    // Opcional: reiniciar el formulario después de cerrar el modal
                    if (authForm) authForm.reset();
                }, 1500);

            } else {
                if (authMessage) authMessage.textContent = data.error || 'Invalid token or email.';
                if (authMessage) authMessage.className = 'text-red-500';
            }
        }
    } catch (error) {
        console.error('Authentication error:', error);
        if (authMessage) authMessage.textContent = 'Network error or server unavailable.';
        if (authMessage) authMessage.className = 'text-red-500';
    }
}

/**
 * Configura los event listeners para el formulario de autenticación.
 * Debe ser llamado desde el punto de entrada principal (main.js).
 * @param {Function} onLoginSuccess Callback a ejecutar después de un login exitoso.
 */
export function setupAuthListeners(onLoginSuccess) {
    const authCloseBtn = authModal ? authModal.querySelector('.close-button') : null;
    if (authCloseBtn) {
        authCloseBtn.addEventListener('click', () => toggleAuthModal(false));
    }
    
    const apiCloseBtn = apiModal ? apiModal.querySelector('.close-button') : null;
    if (apiCloseBtn) {
        apiCloseBtn.addEventListener('click', () => toggleApiModal(false));
    }

    if (authModal) authModal.addEventListener('click', (e) => { 
        if (e.target === authModal) toggleAuthModal(false); 
    });

    if (authForm) authForm.addEventListener('submit', (e) => handleAuthFormSubmit(e, onLoginSuccess));
}