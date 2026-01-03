// public/js/modules/auth.js

import { BACKEND_URL } from '../main.js';

/**
 * Lógica pura de comunicación con el servidor para autenticación
 */
export async function requestToken(email) {
    const response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    return await response.json();
}

export async function verifyToken(email, token) {
    const response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token })
    });
    return await response.json();
}