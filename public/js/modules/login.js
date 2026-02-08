/**
 * public/js/modules/login.js
 * Version: BSB AI Core 2026 - Multi-user access & UI Auto-clean
 */

import { requestToken, verifyToken } from './auth.js';
import { updateLoginIcon } from './appEvents.js';
import { logStatus } from '../main.js'; // To overwrite the "Session not found" message

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
        // --- STEP 1: Request OTP Token ---
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
        // --- STEP 2: Verify Token & Store Session ---
        else {
            const data = await verifyToken(email, token);
            
            if (data && data.token) {
                // 1. SAVE CREDENTIALS
                localStorage.setItem('token', data.token);
                localStorage.setItem('userEmail', email);
                
                const uid = data.userId || (data.user && data.user.id);
                if (uid) {
                    localStorage.setItem('userId', uid);
                }
                
                // 2. IMMEDIATE UI CLEANUP
                // This overwrites the "⚠️ Session not found" warning in the log bar
                logStatus("Session established. Connecting to bot...", "success");

                // 3. UPDATE UI COMPONENTS
                authMessage.textContent = 'Login Successful!';
                authMessage.className = 'text-emerald-400 text-xs mt-2';
                
                updateLoginIcon(); // Changes the icon from Sign-in to Sign-out
                
                // 4. TRIGGER AUTHENTICATED FLOW (Sockets, Data Sync)
                if (onSuccess) onSuccess();
                
                // Close modal after a brief delay
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
        authButton.textContent = 'Continue';
    }
}