/**
 * js/modules/role.js
 * Gestión de permisos de interfaz según el rol del usuario
 */

export function applyRolePermissions() {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        console.warn("[ROLE] No user found in storage, defaulting to restricted view.");
        hideAdvancedTabs();
        return;
    }

    try {
        const user = JSON.parse(userStr);
        const role = user.role || 'current';

        if (role === 'current') {
            hideAdvancedTabs();
        } else {
            showAdvancedTabs();
            console.log(`[ROLE] Privileged role detected: ${role.toUpperCase()}`);
        }
    } catch (e) {
        console.error("[ROLE] Error parsing user data:", e);
        hideAdvancedTabs();
    }
}

function hideAdvancedTabs() {
    const tabs = ['tab-autobot', 'tab-aibot'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showAdvancedTabs() {
    const tabs = ['tab-autobot', 'tab-aibot'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    });
}