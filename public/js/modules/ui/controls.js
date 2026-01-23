// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

// Mapeo de colores hexadecimales (Inmunes al CSS blanco)
const STATUS_COLORS = {
    'RUNNING': '#34d399',      // Esmeralda
    'STOPPED': '#f87171',      // Rojo
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo
    'NO_COVERAGE': '#a78bfa',  // Púrpura
    'PAUSED': '#fb923c'        // Naranja
};

/**
 * Actualiza el estado visual de los botones y labels
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    // Si status es null o undefined, forzamos STOPPED por seguridad
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    // 1. GESTIÓN DEL BOTÓN
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        
        if (isBusy) {
            btn.classList.add('bg-red-600'); 
        } else {
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 2. GESTIÓN DEL LABEL (COLORES)
    if (label) {
        label.textContent = currentStatus;
        
        // Reset de estilos para evitar el color blanco heredado
        label.style.fontSize = "12px";
        label.style.fontWeight = "bold";
        label.style.fontFamily = "monospace";
        
        // Aplicamos color desde el mapa STATUS_COLORS
        const color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
        label.style.color = color; // Esto sobreescribe cualquier CSS
    }

    // 3. GESTIÓN DE INPUTS
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