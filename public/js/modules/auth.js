// public/js/modules/auth.js

import { logMessageElement } from '../main.js';

export function displayLogMessage(message, type) {
    if (logMessageElement) {
        logMessageElement.textContent = message;
        logMessageElement.className = 'log-bar';
        if (type) {
            logMessageElement.classList.add(`log-${type}`);
        }
    }
}