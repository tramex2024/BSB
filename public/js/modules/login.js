// public/js/modules/login.js

import { BACKEND_URL } from '../main.js';
import { displayLogMessage } from './auth.js'; // Mantener si la función existe

// --- Constantes globales para el DOM ---
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const tokenInput = document.getElementById('token');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');
const apiModal = document.getElementById('api-modal');
const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;

/**
 * Helper para hacer llamadas al backend con el token de autenticación.
 * @param {string} url La ruta API relativa.
 * @param {object} options Opciones de la llamada fetch.
 * @returns {Promise<object|null>} La respuesta JSON del backend.
 */
async function fetchFromBackend(url, options = {}) {
    const token = localStorage.getItem('authToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }

    try {
        const res = await fetch(`${BACKEND_URL}${url}`, options);
        if (res.status === 401 || res.status === 403) {
            console.warn("Token inválido o expirado. Deslogueo automático.");
            handleLogout();
            return null;
        }
        if (!res.ok) {
            const errorDetails = await res.json().catch(() => res.text());
            throw new Error(errorDetails.error || errorDetails.message || 'Server error');
        }
        return await res.json();
    } catch (error) {
        console.error(`Error fetching from ${url}:`, error);
        return null;
    }
}

/**
 * Muestra u oculta el modal de autenticación (login/registro).
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
export function toggleAuthModal(show) {
    if (authModal) {
        if (show) {
            authForm.reset();
            authButton.textContent = 'Continue';
            if (authMessage) authMessage.textContent = '';
            if (emailInput) emailInput.disabled = false;
            if (tokenInput) tokenInput.style.display = 'none';
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
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y recarga la página.
 */
export async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        await fetchFromBackend('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo, pero continuará el proceso local:', error);
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        window.location.reload();
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
        
        if (tokenInput.style.display === 'none' || token === '') {
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
                if (tokenInput) tokenInput.style.display = 'block';
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
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userEmail', email);
                
                if (authMessage) authMessage.textContent = data.message;
                if (authMessage) authMessage.className = 'text-green-500';
                
                setTimeout(() => {
                    toggleAuthModal(false);
                    if (onLoginSuccess) onLoginSuccess();
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

// Inicializa los event listeners para el login modal
export function setupAuthListeners(onLoginSuccess) {
    if (authModal) authModal.addEventListener('click', (e) => { 
        if (e.target === authModal) toggleAuthModal(false); 
    });

    if (authForm) authForm.addEventListener('submit', (e) => handleAuthFormSubmit(e, onLoginSuccess));
}