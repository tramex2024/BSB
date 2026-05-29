/**
 * admin.js - Admin Control Panel Logic (Plan Activation, Broadcast System & Tab Navigation)
 * Estado: Auditado y Adaptado a Interfaz Modular por Menús (Sincronizado 2026)
 */
import { logStatus, BACKEND_URL } from '../main.js';

export async function initializeAdminView() {
    console.log("🛠️ Admin View Loaded & Submenus Synchronized");
    
    // --- 1. REFERENCIAS DE ELEMENTOS ---
    const activationForm = document.getElementById('admin-activation-form');
    const notifyForm = document.getElementById('admin-notify-form');
    const targetSelect = document.getElementById('notify-target');
    const specificUserContainer = document.getElementById('specific-user-container');

    // Inicializar el sistema de subpestañas internas
    setupAdminSubTabs();

    // --- 2. LÓGICA DE ACTIVACIÓN DE PLANES ---
    if (activationForm) {
        activationForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('admin-user-email').value.trim();
            const days = document.getElementById('admin-plan-days').value;
            const btn = activationForm.querySelector('button');

            if (!email) return logStatus("❌ Email is required", "error");
            if (!confirm(`Activate ${email} for ${days} days?`)) return;

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Activating...';

                const response = await fetch(`${BACKEND_URL}/api/admin/activate-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ email, days })
                });

                const result = await response.json();

                if (result.success) {
                    logStatus(`✅ SUCCESS: ${email} is now ADVANCED`, 'success');
                    activationForm.reset();
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                logStatus(`❌ Error: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i> ACTIVATE NOW';
            }
        };
    }

    // --- 3. LÓGICA DE NOTIFICACIONES (BROADCAST) ---
    if (notifyForm) {
        // [BLINDAJE]: Cambiado addEventListener por onchange para evitar duplicidad de listeners al re-entrar a la pestaña
        if (targetSelect) {
            targetSelect.onchange = (e) => {
                if (specificUserContainer) {
                    specificUserContainer.style.display = e.target.value === 'one' ? 'block' : 'none';
                }
            };
        }

        notifyForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const target = targetSelect.value;
            const message = document.getElementById('notify-message').value.trim();
            const specificEmail = document.getElementById('notify-email')?.value.trim();
            const btn = notifyForm.querySelector('button');

            // Validaciones previas al envío
            if (!message) {
                return logStatus("❌ Message content cannot be empty", "error");
            }
            if (target === 'one' && (!specificEmail || !specificEmail.includes('@'))) {
                return logStatus("❌ Please enter a valid target email", "error");
            }

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-paper-plane fa-spin mr-2"></i> Sending...';

                const response = await fetch(`${BACKEND_URL}/api/admin/notify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ 
                        target, 
                        message, 
                        email: target === 'one' ? specificEmail : null 
                    })
                });

                const result = await response.json();

                if (result.success) {
                    logStatus(`📢 Broadcast sent to: ${target.toUpperCase()}`, 'success');
                    notifyForm.reset();
                    if (specificUserContainer) specificUserContainer.style.display = 'none';
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                logStatus(`❌ Broadcast Error: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> SEND NOTIFICATION';
            }
        };
    }
}

/**
 * --- 4. ORQUESTADOR DE NAVEGACIÓN INTERNA ---
 * Controla la visualización modular de las tarjetas mediante el submenú superior
 */
function setupAdminSubTabs() {
    const tabs = [
        { btn: 'btn-sub-notifications', sec: 'sec-admin-notifications' },
        { btn: 'btn-sub-activation', sec: 'sec-admin-activation' },
        { btn: 'btn-sub-payments', sec: 'sec-admin-payments' }
    ];

    tabs.forEach(tab => {
        const btnEl = document.getElementById(tab.btn);
        if (!btnEl) return;

        btnEl.onclick = null; // Limpieza preventiva de manejadores previos
        btnEl.onclick = () => {
            tabs.forEach(t => {
                const b = document.getElementById(t.btn);
                const s = document.getElementById(t.sec);
                
                if (b && s) {
                    if (t.btn === tab.btn) {
                        // Estilo Activo (Fondo Ámbar, Texto Oscuro)
                        b.className = "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 bg-amber-500 text-gray-950 shadow-md";
                        s.classList.remove('hidden');
                        s.classList.add('block', 'animate-fade-in');
                    } else {
                        // Estilo Inactivo (Texto Atenuado, Efecto Hover)
                        b.className = "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white hover:bg-gray-800";
                        s.classList.add('hidden');
                        s.classList.remove('block', 'animate-fade-in');
                    }
                }
            });
        };
    });
}