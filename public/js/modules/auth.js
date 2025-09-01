// public/js/modules/auth.js

import { fetchFromBackend } from './api.js';

// Asumimos que displayLogMessage fue movida o corregida
export function displayLogMessage(message, type, logMessageElement) {
    if (logMessageElement) {
        logMessageElement.textContent = message;
        logMessageElement.className = 'log-bar';
        if (type) {
            logMessageElement.classList.add(`log-${type}`);
        }
    }
}

// Lógica para el modal de autenticación
export function toggleAuthModal(show) {
    const authModal = document.getElementById('auth-modal');
    if (authModal) {
        authModal.style.display = show ? 'block' : 'none';
    }
}

// Lógica para el modal de API
export function toggleApiModal(show) {
    const apiModal = document.getElementById('api-modal');
    if (apiModal) {
        apiModal.style.display = show ? 'block' : 'none';
    }
}

// Lógica para manejar el formulario de autenticación
export async function handleAuthFormSubmit(event) {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    const tokenInput = document.getElementById('token');
    const authMessage = document.getElementById('auth-message');

    const email = emailInput.value;
    const token = tokenInput.value;

    // Verificar si el campo de token está vacío
    if (!token || token.length === 0) {
        // Si no hay token, asume que el usuario quiere solicitar uno
        try {
            const data = await fetchFromBackend('/api/auth/request-token', {
                method: 'POST',
                body: JSON.stringify({ email })
            });

            if (data.success) {
                authMessage.textContent = 'Token requested! Please check your email.';
                authMessage.className = 'text-green-500';
            } else {
                authMessage.textContent = data.message || 'Failed to request token.';
                authMessage.className = 'text-red-500';
            }
        } catch (error) {
            authMessage.textContent = `Error requesting token: ${error.message}`;
            authMessage.className = 'text-red-500';
        }
    } else {
        // Si hay un token, asume que el usuario quiere verificarlo
        try {
            const data = await fetchFromBackend('/api/auth/verify-token', {
                method: 'POST',
                body: JSON.stringify({ email, token })
            });
            
            if (data.success) {
                localStorage.setItem('authToken', data.token);
                authMessage.textContent = 'Login successful!';
                authMessage.className = 'text-green-500';
                toggleAuthModal(false);
            } else {
                authMessage.textContent = data.message || 'Login failed.';
                authMessage.className = 'text-red-500';
            }
        } catch (error) {
            authMessage.textContent = `Login failed: ${error.message}`;
            authMessage.className = 'text-red-500';
        }
    }
}

// Lógica para cerrar sesión
export function handleLogout() {
    localStorage.removeItem('authToken');
    // Llama a una función para actualizar el estado de la UI
    // Por ejemplo: updateLoginState(false);
    // Vuelve a la página de inicio o recarga para reflejar el cambio
    window.location.reload();
}