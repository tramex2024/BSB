// public/js/modules/api.js

import { BACKEND_URL } from '../main.js';
import { displayLogMessage } from './auth.js';

// Helper function to update the connection status indicator
function setConnectionStatus(status) {
    const indicator = document.getElementById('connection-indicator');
    const statusText = document.getElementById('connection-text');
    if (!indicator || !statusText) return;

    if (status === 'success') {
        indicator.className = 'indicator-circle bg-green-500';
        statusText.textContent = 'Connected';
    } else if (status === 'error') {
        indicator.className = 'indicator-circle bg-red-500';
        statusText.textContent = 'Disconnected';
    } else {
        indicator.className = 'indicator-circle bg-gray-500';
        statusText.textContent = 'Connecting...';
    }
}

export async function fetchFromBackend(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
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
            throw new Error(`Error ${response.status}: ${data.message || response.statusText}`);
        }

        return data;

    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

export async function handleApiFormSubmit(event) {
    event.preventDefault();

    const apiKey = document.getElementById('api-key').value;
    const secretKey = document.getElementById('secret-key').value;
    const memo = document.getElementById('api-memo').value;
    const apiStatusMessage = document.getElementById('api-status-message');

    apiStatusMessage.textContent = '';
    setConnectionStatus('connecting');

    try {
        const response = await fetchFromBackend('/api/validate-keys', {
            method: 'POST',
            body: JSON.stringify({ apiKey, secretKey, memo }),
        });

        if (response.success) {
            displayLogMessage('API keys successfully validated and saved.', 'success');
            setConnectionStatus('success');
        } else {
            throw new Error(response.message || 'Validation failed.');
        }

    } catch (error) {
        console.error('API validation error:', error);
        displayLogMessage(`API Validation failed: ${error.message}`, 'error');
        setConnectionStatus('error');
    }
}