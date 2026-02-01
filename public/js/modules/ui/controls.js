// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      // Esmeralda
    'STOPPED': '#ef4444',      // Rojo
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo    
    'PAUSED': '#fb923c'        
};

// 🛡️ Registro de campos que el usuario está editando actualmente
export const activeEdits = {};

export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
    }

    if (btn) {
        btn.textContent = isBusy ? `STOP ${type.charAt(0).toUpperCase()}` : `START ${type.charAt(0).toUpperCase()}`;
        
        if (isBusy) {
            btn.classList.remove('bg-emerald-600');
            btn.classList.add('bg-red-600');
        } else {
            btn.classList.remove('bg-red-600');
            btn.classList.add('bg-emerald-600');
        }
        btn.disabled = false;
        btn.style.opacity = "1";
    }

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
 * Sincroniza los valores de los inputs con la configuración de la DB
 * BLINDAJE: Implementa un periodo de gracia de 3 segundos tras editar.
 */
export function syncInputsFromConfig(conf) {
    if (!conf || (!conf.long && !conf.short)) return;

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
        'autriggers': conf.short?.profit_percent
    };

    const now = Date.now();

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        // 🛡️ ESCUDO: Si el input está enfocado O fue editado hace menos de 3 seg, NO TOCAR.
        const lastEdit = activeEdits[id] || 0;
        if (document.activeElement === input || (now - lastEdit < 3000)) {
            continue; 
        }

        // Solo actualizamos si el valor es realmente distinto para evitar parpadeos
        if (parseFloat(input.value) !== parseFloat(value)) {
            input.value = value;
        }
    }
    
    // Checkboxes (lógica similar)
    ['long', 'short'].forEach(side => {
        const id = `au-stop-${side}-at-cycle`;
        const el = document.getElementById(id);
        const val = !!conf[side]?.stopAtCycle;
        const lastEdit = activeEdits[id] || 0;

        if (el && document.activeElement !== el && (now - lastEdit < 3000)) {
            if (el.checked !== val) el.checked = val;
        }
    });
}