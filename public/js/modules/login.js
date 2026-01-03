// public/js/modules/login.js

import { requestToken, verifyToken } from './auth.js';

const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const tokenInput = document.getElementById('token');
const emailSection = document.getElementById('email-section');
const tokenSection = document.getElementById('token-section');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');

export function toggleAuthModal(show) {
    if (!authModal) return;
    if (show) {
        authForm.reset();
        emailSection.style.display = 'block';
        tokenSection.style.display = 'none';
        authButton.textContent = 'Continue';
        authMessage.textContent = '';
        authModal.style.display = 'flex';
    } else {
        authModal.style.display = 'none';
    }
}

export async function handleAuthSubmit(onSuccess) {
    const email = emailInput.value;
    const token = tokenInput.value;
    
    authMessage.textContent = 'Processing...';
    authMessage.className = 'text-yellow-500 text-xs mt-2';

    try {
        // PASO 1: Solicitar Token
        if (tokenSection.style.display === 'none') {
            const data = await requestToken(email);
            if (data.success || data.message) {
                authMessage.textContent = 'Token sent to your email!';
                authMessage.className = 'text-emerald-400 text-xs mt-2';
                emailSection.style.display = 'none';
                tokenSection.style.display = 'block';
                authButton.textContent = 'Verify Code';
            }
        } 
        // PASO 2: Verificar Token
        else {
            const data = await verifyToken(email, token);
            if (data.token) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userEmail', email);
                authMessage.textContent = 'Login Successful!';
                authMessage.className = 'text-emerald-400 text-xs mt-2';
                
                if (onSuccess) onSuccess();
                setTimeout(() => toggleAuthModal(false), 1500);
            } else {
                authMessage.textContent = data.error || 'Invalid Token';
                authMessage.className = 'text-red-400 text-xs mt-2';
            }
        }
    } catch (error) {
        authMessage.textContent = 'Connection Error';
        authMessage.className = 'text-red-400 text-xs mt-2';
    }
}