// public/js/modules/api.js

import { BACKEND_URL } from '../main.js';

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