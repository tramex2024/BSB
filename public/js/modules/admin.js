import { logStatus, BACKEND_URL } from '../main.js';

export async function initializeAdminView() {
    console.log("🛠️ Admin View Loaded");
    
    const form = document.getElementById('admin-activation-form');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('admin-user-email').value;
        const days = document.getElementById('admin-plan-days').value;
        const btn = form.querySelector('button');

        const confirmMsg = `Activate ${email} for ${days} days?`;
        if (!confirm(confirmMsg)) return;

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
                form.reset();
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            logStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'ACTIVATE NOW';
        }
    };
}