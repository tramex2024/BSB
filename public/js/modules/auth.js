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
    const authButton = document.getElementById('auth-button');

    const email = emailInput.value;
    const token = tokenInput.value;

    // LÓGICA CORREGIDA:
    // Si la sección del token no está visible, significa que estamos en el primer paso (solicitar token).
    // Si está visible, estamos en el segundo paso (verificar token).
    if (document.getElementById('token-section').style.display === 'none') {
        // --- LÓGICA PARA SOLICITAR EL TOKEN (Paso 1) ---
        try {
            const data = await fetchFromBackend('/api/auth/request-token', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            
            // EL CAMBIO ESTÁ AQUÍ
            // Aseguramos que la respuesta sea un objeto y tenga la propiedad success
            if (data && data.success) {
                authMessage.textContent = 'Token requested! Please check your email.';
                authMessage.className = 'text-green-500';

                // Muestra la sección del token y oculta la del email
                document.getElementById('email-section').style.display = 'none';
                document.getElementById('token-section').style.display = 'block';
                authButton.textContent = 'Verify Token';

            } else {
                authMessage.textContent = (data && data.message) || 'Failed to request token.';
                authMessage.className = 'text-red-500';
            }
        } catch (error) {
            authMessage.textContent = `Error requesting token: ${error.message}`;
            authMessage.className = 'text-red-500';
        }
    } else {
        // --- LÓGICA PARA VERIFICAR EL TOKEN (Paso 2) ---
        try {
            const data = await fetchFromBackend('/api/auth/verify-token', {
                method: 'POST',
                body: JSON.stringify({ email, token })
            });

            if (data && data.success) {
                localStorage.setItem('authToken', data.token);
                authMessage.textContent = 'Login successful!';
                authMessage.className = 'text-green-500';
                toggleAuthModal(false);
            } else {
                authMessage.textContent = (data && data.message) || 'Login failed.';
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
    window.location.reload();
}