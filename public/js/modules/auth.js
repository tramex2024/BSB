// public/js/modules/auth.js
import { BACKEND_URL, loginLogoutIcon, authModal, authForm, emailInput, tokenInput, authButton, authMessage, logMessageElement } from '../main.js';
import { updateLoginIcon, toggleAuthModal } from './modals.js'; // Importar de modals.js

// Estado de la aplicación relacionado con la autenticación
export let isLoggedIn = false;

/**
 * Muestra un mensaje en la franja de logs superior.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success', 'error', 'info', 'warning' (opcional, para futuros estilos)
 */
export function displayLogMessage(message, type = 'info') {
    if (logMessageElement) {
        logMessageElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        // logMessageElement.className = `log-${type}`; // Descomentar para estilos
        console.log(`[Log Bar] ${message}`);
    }
}

/**
 * Verifica si el usuario está logueado comprobando un token en localStorage.
 * Actualiza la variable `isLoggedIn` y el icono de login.
 */
export function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        isLoggedIn = true;
    } else {
        isLoggedIn = false;
    }
    updateLoginIcon();
}

/**
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y notifica al backend.
 */
export async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (response.ok) {
            console.log('[FRONTEND] Deslogueo en backend exitoso:', data.message);
            displayLogMessage('Logout successful!', 'success');
        } else {
            console.error('[FRONTEND] Error en deslogueo de backend:', data.message || 'Error desconocido');
            displayLogMessage(`Logout error: ${data.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo:', error);
        displayLogMessage('Network error during logout.', 'error');
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        isLoggedIn = false; // Actualiza el estado global
        updateLoginIcon();
        toggleAuthModal(false); // Cierra el modal de auth
        alert('Has cerrado sesión exitosamente.');
        window.location.reload(); // Recarga la página para resetear el estado de la UI
    }
}

/**
 * Helper Function for API Calls (Maneja tokens y rutas dinámicas)
 * @param {string} url - La URL del endpoint del backend (sin la URL base)
 * @param {object} options - Opciones para la llamada fetch
 * @returns {Promise<object|null>} - La respuesta JSON del backend o null en caso de error
 */
export async function fetchFromBackend(url, options = {}) {
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        }

        const res = await fetch(`${BACKEND_URL}${url}`, options);

        if (!res.ok) {
            let errorDetails = `HTTP error! status: ${res.status}`;
            try {
                const errorData = await res.json();
                errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (jsonError) {
                errorDetails = await res.text() || `HTTP error! status: ${res.status} (non-JSON response or empty)`;
            }

            if (res.status === 401 || res.status === 403) {
                console.warn("Token inválido o expirado. Iniciando deslogueo automático.");
                displayLogMessage("Your session has expired or is invalid. Please log in again.", "error");
                alert("Tu sesión ha expirado o no es válida. Por favor, inicia sesión de nuevo.");
                handleLogout(); // Llama a la función de deslogueo
            }
            throw new Error(errorDetails);
        }
        return await res.json();
    } catch (error) {
        console.error(`Error fetching from ${url}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error occurred.");
        if (document.getElementById('order-list')) { // Asume que order-list puede existir
            document.getElementById('order-list').innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
        }
        displayLogMessage(`Backend communication error: ${errorMessage}`, 'error');
        return null;
    }
}