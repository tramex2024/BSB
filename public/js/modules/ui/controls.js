// public/js/modules/ui/controls.js - Gestión de estados visuales basada en los IDs reales del HTML

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED', 'NO_COVERAGE'];

const STATUS_COLORS = {
    'RUNNING': '#10b981',      // Esmeralda
    'STOPPED': '#ef4444',      // Rojo
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo    
    'PAUSED': '#fb923c',
    'NO_COVERAGE': '#fb923c',
};

export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    
    // CORRECCIÓN DE ID: Tu HTML usa 'aubot-lstate' y 'aubot-sstate'
    // 'type' viene como 'LONG' o 'SHORT', así que tomamos la primera letra:
    const typeKey = type.charAt(0).toLowerCase(); // 'l' o 's'
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    // 1. ACTUALIZAR ETIQUETA (LState / SState)
    if (label) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
        // Forzamos visibilidad para asegurar que no sea tapado por CSS
        label.style.fontWeight = "bold";
    }

    // 2. ACTUALIZAR BOTÓN
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type.charAt(0)}` : `START ${type.charAt(0)}`;
        
        // Manejo de clases de Tailwind
        if (isBusy) {
            btn.classList.replace('bg-emerald-600', 'bg-red-600');
            // Si no existía bg-emerald, forzamos:
            btn.classList.add('bg-red-600');
        } else {
            btn.classList.replace('bg-red-600', 'bg-emerald-600');
            btn.classList.add('bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 3. GESTIÓN DE INPUTS (Bloqueo si está activo)
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isBusy;
            el.style.opacity = isBusy ? "0.6" : "1";
            el.style.cursor = isBusy ? "not-allowed" : "text";
        }
    });
}

/**
 * Sincroniza los valores de los inputs con la configuración de la DB (Mismo mapping)
 */
export function syncInputsFromConfig(conf) {
    if (!conf) return;
    const mapping = {
        'auamountl-usdt': conf.long?.amountUsdt,
        'aupurchasel-usdt': conf.long?.purchaseUsdt,
        'auincrementl': conf.long?.size_var,
        'audecrementl': conf.long?.price_var,
        'aupricestep-l': conf.long?.price_step_inc,
        'autriggerl': conf.long?.profit_percent,
        'auamounts-usdt': conf.short?.amountUsdt,
        'aupurchases-usdt': conf.short?.purchaseUsdt,
        'auincrements': conf.short?.size_var,
        'audecrements': conf.short?.price_var,
        'aupricestep-s': conf.short?.price_step_inc,
        'autriggers': conf.short?.profit_percent,
        'auamountai-usdt': conf.ai?.amountUsdt
    };

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (input && value !== undefined && document.activeElement !== input) {
            // Solo actualizamos si el cambio es significativo para no molestar al usuario
            const currentVal = parseFloat(input.value) || 0;
            const newVal = parseFloat(value) || 0;
            if (Math.abs(newVal - currentVal) > 0.000001) {
                input.value = value;
            }
        }
    }
    
    // Sincronización de Checkboxes (Auto-stop)
    ['long', 'short', 'ai'].forEach(side => {
        const el = document.getElementById(`au-stop-${side}-at-cycle`);
        const checked = !!conf[side]?.stopAtCycle;
        if (el && document.activeElement !== el) el.checked = checked;
    });
}