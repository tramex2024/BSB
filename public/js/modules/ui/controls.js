// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

// Mapeo corregido: RUNNING = ROJO (Para indicar que se puede detener), STOPPED = VERDE (Listo)
const STATUS_COLORS = {
    'RUNNING': '#ef4444',      // Rojo (Tailwind red-500)
    'STOPPED': '#10b981',      // Esmeralda (Tailwind emerald-500)
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo
    'NO_COVERAGE': '#a78bfa',  // Púrpura
    'PAUSED': '#fb923c'        // Naranja
};

/**
 * Actualiza el estado visual de los botones y labels
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    // Intentamos ambos formatos de ID por si acaso
    const label = document.getElementById(`aubot-${type.toLowerCase()}state`) || 
                  document.getElementById(`${type.toLowerCase()}-status-label`);
    
    // 1. GESTIÓN DEL BOTÓN (Sincronizado con el fondo y el texto)
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        
        // Limpieza de clases de fondo
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600', 'bg-gray-600');
        
        if (isBusy) {
            btn.classList.add('bg-red-600'); // Si corre, botón rojo para parar
        } else {
            // Si está parado, verde para empezar (o índigo si es AI)
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 2. GESTIÓN DEL LABEL (COLORES DINÁMICOS)
    if (label) {
        label.textContent = currentStatus;
        label.style.fontWeight = "bold";
        label.style.fontFamily = "monospace";
        
        // Aplicamos el color del mapa
        const color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
        label.style.color = color;
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