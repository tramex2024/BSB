/**
 * js/modules/role.js
 * Gestión de permisos de interfaz según el rol del usuario (Pro-Sync 2026)
 */

export function applyRolePermissions() {
    const userStr = localStorage.getItem('user');
    
    if (!userStr) {
        hideAdvancedTabs();
        return 'current';
    }

    try {
        const user = JSON.parse(userStr);
        const role = user.role || 'current';
        const expiresAt = user.roleExpiresAt; // Fecha que viene del servidor

        // --- 1. VERIFICACIÓN DE EXPIRACIÓN ---
        if (role === 'advanced' && expiresAt && new Date() > new Date(expiresAt)) {
            console.warn("[ROLE] Subscription expired.");
            // Opcional: Podrías llamar al servidor aquí para degradar el rol
            hideAdvancedTabs();
            return 'current';
        }

        // --- 2. GESTIÓN DE PESTAÑAS SEGÚN ROL ---
        if (role === 'admin') {
            showAdvancedTabs();
            toggleAdminTab(true); // Tú ves todo + Admin
            return 'admin';
        } else if (role === 'advanced') {
            showAdvancedTabs();
            toggleAdminTab(false); // Usuarios Pro ven bots, pero no Admin
            return 'advanced';
        } else {
            hideAdvancedTabs();
            toggleAdminTab(false); // Usuarios gratis no ven nada extra
            return 'current';
        }

    } catch (e) {
        console.error("[ROLE] Error parsing user data:", e);
        hideAdvancedTabs();
        return 'current';
    }
}

function toggleAdminTab(show) {
    const adminTab = document.getElementById('tab-admin');
    if (adminTab) {
        adminTab.style.display = show ? 'flex' : 'none';
    }
}

function hideAdvancedTabs() {
    const tabs = ['tab-autobot', 'tab-aibot'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none'; 
    });

    const currentTab = document.querySelector('.nav-tab.active')?.dataset.tab;
    if (currentTab === 'autobot' || currentTab === 'aibot' || currentTab === 'admin') {
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