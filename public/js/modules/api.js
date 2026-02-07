// public/js/modules/api.js

import { BACKEND_URL } from '../main.js';

/**
 * Función genérica para peticiones al servidor.
 * Usa 'token' (coincidiendo con login.js) para la autorización.
 */
export async function fetchFromBackend(endpoint, options = {}) {
    const token = localStorage.getItem('token'); // Cambiado de 'authToken' a 'token'
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${BACKEND_URL}${endpoint}`;

    try {
        const response = await fetch(url, { ...options, headers });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `Error ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

/**
 * Maneja el envío del formulario de llaves API de BitMart
 */
export async function handleApiFormSubmit(event) {
    event.preventDefault();

    const apiKey = document.getElementById('api-key').value;
    const secretKey = document.getElementById('secret-key').value;
    const apiStatusMessage = document.getElementById('api-status-message');

    if (!apiStatusMessage) return;

    apiStatusMessage.textContent = 'Guardando llaves...';
    apiStatusMessage.className = 'text-xs text-center text-yellow-500';

    try {
        // CAMBIO AQUÍ: Cambiamos /api/auth por /api/users
        const data = await fetchFromBackend('/api/users/api-keys', { 
            method: 'POST',
            body: JSON.stringify({ apiKey, secretKey }),
        });

        // Verificamos data.success o data.connected según lo que devuelve tu controlador
        if (data.success || data.connected) {
            apiStatusMessage.textContent = '¡Llaves guardadas correctamente!';
            apiStatusMessage.className = 'text-xs text-center text-emerald-500';
            
            setTimeout(() => {
                const apiModal = document.getElementById('api-modal');
                if (apiModal) apiModal.style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        apiStatusMessage.textContent = `Error: ${error.message}`;
        apiStatusMessage.className = 'text-xs text-center text-red-500';
    }
}