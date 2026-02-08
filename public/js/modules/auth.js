// public/js/modules/auth.js

/**
 * auth.js - API Authentication Layer
 * Versión: BSB 2026 - Multiusuario
 */
import { BACKEND_URL } from '../main.js';

/**
 * Solicita el código OTP al correo electrónico
 */
export async function requestToken(email) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return await response.json();
    } catch (error) {
        console.error("❌ Auth Error (Request):", error);
        return { success: false, error: "Servidor no alcanzable" };
    }
}

/**
 * Verifica el código OTP y retorna el JWT + UserId
 */
export async function verifyToken(email, token) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token })
        });
        
        const data = await response.json();
        
        // El backend 2026 devuelve: { token, userId, email }
        // login.js usará esta data para establecer la sesión.
        return data;
        
    } catch (error) {
        console.error("❌ Auth Error (Verify):", error);
        return { success: false, error: "Error de conexión con el servidor" };
    }
}