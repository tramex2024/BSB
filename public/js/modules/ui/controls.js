// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

// Mapeo de colores para los estados
const STATUS_COLORS = {
    'RUNNING': '#34d399',      // Emerald
    'STOPPED': '#f87171',      // Red
    'BUYING': '#60a5fa',       // Blue
    'SELLING': '#fbbf24',      // Yellow
    'NO_COVERAGE': '#a78bfa',  // Purple
    'PAUSED': '#fb923c'        // Orange
};

/**
 * Actualiza el estado visual de los botones y labels
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    if (status === undefined || status === null) return;

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    const currentStatus = status.toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // --- LÓGICA DE BOTONES ---
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        
        // Colores de fondo de Tailwind para los botones
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        if (isBusy) {
            btn.classList.add('bg-red-600'); 
        } else {
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // --- LÓGICA DE TEXTOS DE ESTADO (Label) ---
    if (label) {
        label.textContent = currentStatus;
        
        // Aplicamos estilos base
        label.style.fontSize = "12px";
        label.style.fontWeight = "bold";
        label.style.fontFamily = "monospace";
        
        // IMPORTANTE: Limpiamos clases de color de Tailwind previas para evitar conflictos
        label.classList.remove('text-white', 'text-gray-400', 'text-red-400', 'text-emerald-400');
        
        // Aplicamos el color desde el mapa (Inmune al CSS blanco del body)
        const color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
        label.style.color = color;
    }

    // --- LÓGICA DE INPUTS ---
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isBusy;
            el.style.opacity = isBusy ? "0.5" : "1";
        }
    });
}

/**
 * Sincroniza los valores de los inputs con la configuración de la DB
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
            const currentVal = parseFloat(input.value) || 0;
            const newVal = parseFloat(value) || 0;
            if (Math.abs(newVal - currentVal) > 0.000001) {
                input.value = value;
            }
        }
    }
    
    ['long', 'short', 'ai'].forEach(side => {
        const el = document.getElementById(`au-stop-${side}-at-cycle`);
        const checked = !!conf[side]?.stopAtCycle;
        if (el && document.activeElement !== el) el.checked = checked;
    });
}