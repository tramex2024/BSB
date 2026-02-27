/**
 * js/modules/role.js
 * Gestión de permisos de interfaz según el rol del usuario (Pro-Sync 2026)
 */

export function applyRolePermissions() {
    const userStr = localStorage.getItem('user');
    
    // Si no hay usuario, restringimos todo
    if (!userStr) {
        hideAdvancedTabs();
        return 'current';
    }

    try {
        const user = JSON.parse(userStr);
        const role = user.role || 'current';

        if (role === 'advanced' || role === 'admin') {
            showAdvancedTabs();
            console.log(`[ROLE] ${role.toUpperCase()} access granted.`);
            return role;
        } else {
            hideAdvancedTabs();
            return 'current';
        }
    } catch (e) {
        console.error("[ROLE] Error parsing user data:", e);
        hideAdvancedTabs();
        return 'current';
    }
}

function hideAdvancedTabs() {
    const tabs = ['tab-autobot', 'tab-aibot'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // En lugar de eliminarlo, podemos ponerle un candado visual
            el.style.display = 'none'; 
        }
    });

    // Seguridad: Si el usuario está en una pestaña prohibida, lo mandamos al dashboard
    const currentTab = document.querySelector('.nav-tab.active')?.dataset.tab;
    if (currentTab === 'autobot' || currentTab === 'aibot') {
        console.warn("[ROLE] Restricted area. Redirecting to Dashboard...");
        const dashboardTab = document.querySelector('[data-tab="dashboard"]');
        if (dashboardTab) dashboardTab.click();
    }
}

function showAdvancedTabs() {
    const tabs = ['tab-autobot', 'tab-aibot'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    });
}