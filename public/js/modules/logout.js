// public/js/modules/logout.js

import { BACKEND_URL } from '../main.js';

/**
 * Helper para hacer llamadas al backend con el token de autenticación.
 * @param {string} url La ruta API relativa.
 * @param {object} options Opciones de la llamada fetch.
 * @returns {Promise<object|null>} La respuesta JSON del backend.
 */
async function fetchFromBackend(url, options = {}) {
    // CORRECCIÓN CLAVE: Usa 'token' en lugar de 'authToken'
    const token = localStorage.getItem('token');
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
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y actualiza la UI.
 */
export async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        // Llama al endpoint de logout del backend
        await fetchFromBackend('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo, pero continuará el proceso local:', error);
    } finally {
        // CORRECCIÓN CLAVE: Limpia el token usando la clave 'token'
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        window.location.reload();
    }
}