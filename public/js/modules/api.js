// public/js/modules/api.js

import { BACKEND_URL } from '../main.js';

/**
 * Generic function for server requests.
 * Uses 'token' for authorization.
 */
export async function fetchFromBackend(endpoint, options = {}) {
    const token = localStorage.getItem('token');
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
 * Handles BitMart API keys form submission
 */
export async function handleApiFormSubmit(event) {
    event.preventDefault();

    // Capturing the 3 values from the updated modal
    const apiKey = document.getElementById('api-key').value;
    const secretKey = document.getElementById('secret-key').value;
    const apiMemo = document.getElementById('api-memo').value; 
    const apiStatusMessage = document.getElementById('api-status-message');

    if (!apiStatusMessage) return;

    apiStatusMessage.textContent = 'Saving and encrypting keys...';
    apiStatusMessage.className = 'text-xs text-center text-yellow-500';

    try {
        const data = await fetchFromBackend('/api/users/api-keys', { 
            method: 'POST',
            body: JSON.stringify({ 
                apiKey, 
                secretKey, 
                apiMemo 
            }),
        });

        if (data.success || data.connected) {
            apiStatusMessage.textContent = 'API keys and Memo saved successfully!';
            apiStatusMessage.className = 'text-xs text-center text-emerald-500';
            
            // Close modal after 2 seconds
            setTimeout(() => {
                const apiModal = document.getElementById('api-modal');
                if (apiModal) apiModal.style.display = 'none';
                
                // Optional: Clear fields for security
                document.getElementById('api-key').value = '';
                document.getElementById('secret-key').value = '';
                document.getElementById('api-memo').value = '';
            }, 2000);
        }
    } catch (error) {
        apiStatusMessage.textContent = `Error: ${error.message}`;
        apiStatusMessage.className = 'text-xs text-center text-red-500';
    }
}