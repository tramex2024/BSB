// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

// Mapeo exacto a las clases que tienen !important en tu style.css
const STATUS_CLASSES = {
    'RUNNING': 'text-emerald-400',
    'STOPPED': 'text-red-400',
    'BUYING': 'text-blue-400',
    'SELLING': 'text-yellow-400',
    'NO_COVERAGE': 'text-purple-400',
    'PAUSED': 'text-orange-400'
};

/**
 * Actualiza el estado visual de los botones y labels
 * Blindada contra el color blanco por defecto del CSS global
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    if (status === undefined || status === null) return;

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    // 1. Normalización de datos
    const currentStatus = status.toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // 2. GESTIÓN DEL BOTÓN (START/STOP)
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        
        // Reset de colores de fondo
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        
        if (isBusy) {
            btn.classList.add('bg-red-600'); 
        } else {
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

   // 3. GESTIÓN DEL LABEL (DENTRO DE updateButtonState)
    if (label) {
        label.textContent = currentStatus;

        // Limpieza total de clases previas
        label.className = "text-[12px] font-bold font-mono"; 

        // Usamos el nuevo nombre del objeto: STATUS_CLASSES
        const colorClass = STATUS_CLASSES[currentStatus];

        if (colorClass) {
            label.classList.add(colorClass);
        } else {
            // Si el estado es STOPPED pero algo falló en el mapa, forzamos rojo
            label.classList.add(currentStatus === 'STOPPED' ? 'text-red-400' : 'text-gray-400');
        }
    }

    // 4. GESTIÓN DE INPUTS (Bloqueo por actividad)
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