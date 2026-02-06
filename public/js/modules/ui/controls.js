// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',        
};

export const activeEdits = {};

document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') {
        activeEdits[e.target.id] = Date.now();
    }
});

/**
 * Bloquea estrictamente TODOS los parámetros si la estrategia no está en STOPPED
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    
    // Sincronizar el label de estado (ej: aubot-lstate)
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
    }

    if (btn) {
        // Texto del botón
        btn.textContent = isBusy ? `STOP ${type.toUpperCase()}` : `START ${type.toUpperCase()}`;
        
        // Colores de fondo según estado
        if (isBusy) {
            btn.classList.remove('bg-emerald-600', 'bg-blue-600');
            btn.classList.add('bg-red-600');
        } else {
            btn.classList.remove('bg-red-600');
            // AI usa azul, Long/Short usan esmeralda según tu diseño
            btn.classList.add(type === 'AI' ? 'bg-blue-600' : 'bg-emerald-600');
        }
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 🛡️ BLOQUEO DE SEGURIDAD: 
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
 * Sincroniza los valores de los inputs con la config del servidor
 * Evita sobrescribir si el usuario está editando (3s de gracia)
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
        'auamountai-usdt': conf.ai?.amountUsdt,
        'ai-amount-usdt': conf.ai?.amountUsdt
    };

    const now = Date.now();

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        const lastEdit = activeEdits[id] || 0;
        const isFreshlyEdited = (now - lastEdit < 3000);

        if (document.activeElement === input || isFreshlyEdited) continue; 

        const currentVal = parseFloat(input.value) || 0;
        const newVal = parseFloat(value) || 0;

        if (Math.abs(currentVal - newVal) > 0.000001) {
            input.value = value;
        }
    }
    
    // Sincronización de Checkboxes (Stop at Cycle)
    ['long', 'short', 'ai'].forEach(side => {
        // IDs posibles para los checkboxes
        const ids = [`au-stop-${side}-at-cycle`];
        if (side === 'ai') ids.push('ai-stop-at-cycle');

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            const val = !!conf[side]?.stopAtCycle;
            const lastEdit = activeEdits[id] || 0;

            if (document.activeElement !== el && (now - lastEdit >= 3000)) {
                if (el.checked !== val) el.checked = val;
            }
        });
    });
}