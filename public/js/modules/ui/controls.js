// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED', 'WAITING']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',
    'WAITING': '#8b5cf6'      
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
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
    }

    if (btn) {
        // CAMBIO AQUÍ: Si es AI, usamos "AI CORE" para que coincida con el resto de la app
        const suffix = (type === 'AI') ? 'AI CORE' : type.toUpperCase();
        btn.textContent = isBusy ? `STOP ${suffix}` : `START ${suffix}`;
        
        if (isBusy) {
            btn.classList.remove('bg-emerald-600', 'bg-blue-600');
            btn.classList.add('bg-red-600');
        } else {
            btn.classList.remove('bg-red-600');
            // Si es AI usamos el azul que tienes en el diseño, si no, esmeralda
            btn.classList.add(type === 'AI' ? 'bg-blue-600' : 'bg-emerald-600');
        }
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 🛡️ BLOQUEO DE SEGURIDAD: 
    // Si isBusy es true, se deshabilitan todos los IDs proporcionados.
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isBusy;
            el.style.opacity = isBusy ? "0.6" : "1";
            el.style.cursor = isBusy ? "not-allowed" : "text";
        }
    });
}

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
        'autriggers': conf.short?.profit_percent,
        'auamountai-usdt': conf.ai?.amountUsdt
    };

    const now = Date.now();

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        const lastEdit = activeEdits[id] || 0;
        const isFreshlyEdited = (now - lastEdit < 3000);

        if (document.activeElement === input || isFreshlyEdited) {
            continue; 
        }

        if (parseFloat(value) === 0 && parseFloat(input.value) > 0) {
            continue;
        }

        const currentVal = parseFloat(input.value) || 0;
        const newVal = parseFloat(value) || 0;

        if (Math.abs(currentVal - newVal) > 0.000001) {
            input.value = value;
        }
    }
    
    ['long', 'short', 'ai'].forEach(side => {
        const id = `au-stop-${side}-at-cycle`;
        const el = document.getElementById(id);
        const val = !!conf[side]?.stopAtCycle;
        const lastEdit = activeEdits[id] || 0;

        if (el && document.activeElement !== el && (now - lastEdit >= 3000)) {
            if (el.checked !== val) el.checked = val;
        }
    });
}