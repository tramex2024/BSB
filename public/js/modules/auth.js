// public/js/modules/auth.js

import { fetchFromBackend } from './api.js';

export function displayLogMessage(message, type, logMessageElement) {
    if (logMessageElement) {
        logMessageElement.textContent = message;
        logMessageElement.className = 'log-bar';
        if (type) {
            logMessageElement.classList.add(`log-${type}`);
        }
    }
}

// ... otras funciones de autenticación