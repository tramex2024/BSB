// public/js/modules/api.js
import { BACKEND_URL } from '../main.js';
import { displayLogMessage, toggleApiModal } from './auth.js';

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

    const token = localStorage.getItem('authToken');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

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
        console.error('API call error:', error);
        throw error;
    }
}

/**
 * Maneja el envío del formulario para guardar las claves de API.
 * @param {Event} event
 */
export async function handleApiFormSubmit(event) {
    event.preventDefault();
    const apiKeyInput = document.getElementById('api-key');
    const secretKeyInput = document.getElementById('secret-key');
    const apiMemoInput = document.getElementById('api-memo');
    const apiStatusMessage = document.getElementById('api-status-message');
    const logMessageElement = document.getElementById('log-message');

    const apiKey = apiKeyInput.value;
    const secretKey = secretKeyInput.value;
    const memo = apiMemoInput.value;

    const data = {
        apiKey,
        secretKey,
        memo
    };

    try {
        const response = await fetchFromBackend('/save-api-keys', 'POST', data);

        if (response.success) {
            apiStatusMessage.textContent = 'API keys saved successfully!';
            apiStatusMessage.className = 'text-green-500';
            displayLogMessage('API keys saved successfully.', 'success', logMessageElement);
            setTimeout(() => toggleApiModal(false), 2000);
        } else {
            apiStatusMessage.textContent = response.message || 'Failed to save API keys.';
            apiStatusMessage.className = 'text-red-500';
            displayLogMessage(response.message || 'Failed to save API keys.', 'error', logMessageElement);
        }
    } catch (error) {
        apiStatusMessage.textContent = `Error: ${error.message}`;
        apiStatusMessage.className = 'text-red-500';
        displayLogMessage(`Error saving API keys: ${error.message}`, 'error', logMessageElement);
    }
}