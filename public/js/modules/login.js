/**
 * public/js/modules/login.js
 * Versión: BSB 2026 - Gestión de acceso multiusuario
 */

import { requestToken, verifyToken } from './auth.js';
import { updateLoginIcon } from './appEvents.js';

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
        // --- PASO 1: Solicitar Token (OTP) ---
        if (tokenSection.style.display === 'none') {
            const data = await requestToken(email);
            
            if (data && (data.success || data.message)) {
                authMessage.textContent = 'Token sent to your email!';
                authMessage.className = 'text-emerald-400 text-xs mt-2';
                emailSection.style.display = 'none';
                tokenSection.style.display = 'block';
                authButton.textContent = 'Verify Code';
            } else {
                throw new Error(data.error || 'Failed to send token');
            }
        }
        // --- PASO 2: Verificar Token y Guardar Sesión ---
        else {
            const data = await verifyToken(email, token);
            
            if (data && data.token) {
                // GUARDAR DATOS EN LOCALSTORAGE
                localStorage.setItem('token', data.token);
                localStorage.setItem('userEmail', email);
                
                // CRÍTICO: Guardamos el ID de usuario para que el Socket sepa a qué sala entrar
                // Intentamos leerlo desde data.userId o data.user.id según lo envíe tu backend
                const uid = data.userId || (data.user && data.user.id);
                if (uid) {
                    localStorage.setItem('userId', uid);
                }
                
                // ACTUALIZAR INTERFAZ
                authMessage.textContent = 'Login Successful!';
                authMessage.className = 'text-emerald-400 text-xs mt-2';
                
                updateLoginIcon(); // Cambia el icono de Sign In a Sign Out
                
                // Si hay una función de éxito (como inicializar sockets), la ejecutamos
                if (onSuccess) onSuccess();
                
                // Cerramos el modal tras un breve retraso para que el usuario vea el éxito
                setTimeout(() => toggleAuthModal(false), 1500);
                
            } else {
                authMessage.textContent = data.error || 'Invalid Token';
                authMessage.className = 'text-red-400 text-xs mt-2';
            }
        }
    } catch (error) {
        console.error('Login Error:', error);
        authMessage.textContent = 'Error: ' + (error.message || 'Connection failed');
        authMessage.className = 'text-red-400 text-xs mt-2';
        authButton.textContent = 'Continue'; // Reset texto para permitir reintento
    }
}