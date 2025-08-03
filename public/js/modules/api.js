// public/js/modules/api.js
import { displayLogMessage } from './auth.js';
import { BACKEND_URL } from '../main.js';

/**
 * Función genérica para hacer llamadas a la API de tu backend.
 * @param {string} endpoint El endpoint de la API (ej. '/bitmart-data').
 * @param {string} method El método HTTP (ej. 'GET', 'POST').
 * @param {object} body El cuerpo de la solicitud (para POST/PUT).
 * @returns {Promise<object>} Los datos de la respuesta en formato JSON.
 */
export async function fetchFromBackend(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'No message provided' }));
            throw new Error(`Error ${response.status}: ${errorData.message}`);
        }
        return await response.json();
    } catch (error) {
        displayLogMessage(`API call failed: ${error.message}`, 'error');
        console.error('API call error:', error);
        throw error;
    }
}