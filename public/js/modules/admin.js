/**
 * admin.js - Admin Control Panel Logic (Plan Activation, Broadcast System & Tab Navigation)
 * Estado: Auditado, Modular y con Data Base Explorer Activo (Sincronizado 2026)
 */
import { logStatus, BACKEND_URL } from '../main.js';

export async function initializeAdminView() {
    console.log("🛠️ Admin View Loaded & Submenus Synchronized");
    
    // --- 1. REFERENCIAS DE ELEMENTOS ---
    const activationForm = document.getElementById('admin-activation-form');
    const notifyForm = document.getElementById('admin-notify-form');
    const targetSelect = document.getElementById('notify-target');
    const specificUserContainer = document.getElementById('specific-user-container');
    const userList = document.getElementById('user-list-options'); // Para el autocompletado

    setupAdminSubTabs();

    // Cargar lista de usuarios para el Data Base Explorer
    if (userList) {
        fetch(`${BACKEND_URL}/api/admin/users-list`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        .then(res => res.json())
        .then(users => {
            userList.innerHTML = users.map(u => `<option value="${u.email}">`).join('');
        })
        .catch(err => console.error("Error loading user list:", err));
    }

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
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ email, days })
                });
                const result = await response.json();
                if (result.success) {
                    logStatus(`✅ SUCCESS: ${email} is now ADVANCED`, 'success');
                    activationForm.reset();
                } else throw new Error(result.message);
            } catch (error) {
                logStatus(`❌ Error: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i> ACTIVATE NOW';
            }
        };
    }

    // --- 3. LÓGICA DE NOTIFICACIONES ---
    if (notifyForm) {
        if (targetSelect) {
            targetSelect.onchange = (e) => {
                if (specificUserContainer) specificUserContainer.style.display = e.target.value === 'one' ? 'block' : 'none';
            };
        }
        notifyForm.onsubmit = async (e) => {
            e.preventDefault();
            const target = targetSelect.value;
            const message = document.getElementById('notify-message').value.trim();
            const specificEmail = document.getElementById('notify-email')?.value.trim();
            const btn = notifyForm.querySelector('button');

            if (!message) return logStatus("❌ Message content cannot be empty", "error");
            try {
                btn.disabled = true;
                const response = await fetch(`${BACKEND_URL}/api/admin/notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ target, message, email: target === 'one' ? specificEmail : null })
                });
                const result = await response.json();
                if (result.success) {
                    logStatus(`📢 Broadcast sent to: ${target.toUpperCase()}`, 'success');
                    notifyForm.reset();
                } else throw new Error(result.message);
            } catch (error) {
                logStatus(`❌ Broadcast Error: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> SEND NOTIFICATION';
            }
        };
    }

    // --- 4. LÓGICA: DATA BASE EXPLORER ---
    const btnFetchDb = document.getElementById('btn-fetch-db');
    const btnUpdateDb = document.getElementById('btn-update-db');
    const container = document.getElementById('db-results-container');

    if (btnFetchDb) {
        btnFetchDb.onclick = async () => {
            const email = document.getElementById('db-search-email').value.trim();
            if (!email) return logStatus("❌ Email is required", "error");

            container.innerHTML = "Loading...";
            try {
                const response = await fetch(`${BACKEND_URL}/api/admin/bot-data?email=${encodeURIComponent(email)}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const result = await response.json();
                if (result.success) {
                    container.innerHTML = `<pre id="json-display" contenteditable="true" class="p-4 bg-gray-900 border border-purple-500 rounded text-green-400">${JSON.stringify(result.data, null, 2)}</pre>`;
                    if (btnUpdateDb) btnUpdateDb.classList.remove('hidden');
                } else {
                    container.innerHTML = `❌ ${result.message}`;
                }
            } catch (error) {
                container.innerHTML = `❌ Error: ${error.message}`;
            }
        };
    }

    if (btnUpdateDb) {
        // Dentro de btnUpdateDb.onclick en admin.js:
btnUpdateDb.onclick = async () => {
    const jsonText = document.getElementById('json-display').innerText;
    try {
        const updatedData = JSON.parse(jsonText);
        
        // Enviamos al servidor
        const response = await fetch(`${BACKEND_URL}/api/admin/update-bot`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify({ 
                userId: updatedData.userId, // Usamos el ID que viene en el JSON
                updatedData: updatedData 
            })
        });

        const result = await response.json();
        if (result.success) {
            logStatus("✅ Database updated successfully!", "success");
        } else {
            throw new Error(result.message);
        }
    } catch (e) {
        logStatus("❌ Update Failed: " + e.message, "error");
    }
};
    }
}

/**
 * --- 5. ORQUESTADOR DE NAVEGACIÓN INTERNA ---
 */
function setupAdminSubTabs() {
    const tabs = [
        { btn: 'btn-sub-notifications', sec: 'sec-admin-notifications' },
        { btn: 'btn-sub-activation', sec: 'sec-admin-activation' },
        { btn: 'btn-sub-payments', sec: 'sec-admin-payments' },
        { btn: 'btn-sub-database', sec: 'sec-admin-database' }
    ];

    tabs.forEach(tab => {
        const btnEl = document.getElementById(tab.btn);
        if (!btnEl) return;
        btnEl.onclick = () => {
            tabs.forEach(t => {
                const b = document.getElementById(t.btn);
                const s = document.getElementById(t.sec);
                if (b && s) {
                    if (t.btn === tab.btn) {
                        b.className = "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 bg-amber-500 text-gray-950 shadow-md";
                        s.classList.remove('hidden');
                        s.classList.add('block', 'animate-fade-in');
                    } else {
                        b.className = "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-gray-400 hover:text-white hover:bg-gray-800";
                        s.classList.add('hidden');
                        s.classList.remove('block', 'animate-fade-in');
                    }
                }
            });
        };
    });
}