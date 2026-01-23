// public/js/modules/ui/controls.js

/**
 * ESTADOS ACTIVOS (BUSY)
 * Si el bot está en cualquiera de estos estados, el botón debe ser ROJO (STOP)
 * y los inputs deben estar bloqueados.
 */
const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

/**
 * Mapeo de estados a clases CSS de Tailwind originales
 */
const STATUS_COLORS = {
    RUNNING: 'text-emerald-400',
    STOPPED: 'text-red-400',
    BUYING: 'text-blue-400',
    SELLING: 'text-yellow-400',
    NO_COVERAGE: 'text-purple-400',
    PAUSED: 'text-orange-400'
};

/**
 * Actualiza el estado visual de los botones y labels según la base de datos
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    if (status === undefined || status === null) return;

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    // .trim() elimina espacios invisibles que rompen el mapeo de colores
    const currentStatus = status.toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // 1. Actualizar el Botón (Acción: START o STOP)
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        
        if (isBusy) {
            btn.classList.add('bg-red-600'); // Rojo cuando el bot está trabajando para poder detenerlo
        } else {
            // Color según el bot (Esmeralda para Autobot, Índigo para AI) al estar detenido
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 2. Actualizar el Label de Estado (Color específico y Tamaño aumentado)
    if (label) {
        label.textContent = currentStatus;
        
        // --- MEJORA DE TAMAÑO ---
        // Eliminamos clases de tamaño pequeñas y forzamos text-[12px] (un punto más)
        label.classList.remove('text-[9px]', 'text-[10px]', 'text-xs');
        label.classList.add('text-[12px]'); 

        // --- CORRECCIÓN DE COLOR ---
        // Eliminamos CUALQUIER rastro de color previo para que no haya conflicto
        label.classList.remove(
            'text-emerald-400', 'text-red-400', 'text-blue-400', 
            'text-yellow-400', 'text-purple-400', 'text-orange-400', 'text-gray-400'
        );
        
        // Aplicamos el color que le corresponde según tu objeto STATUS_COLORS
        const colorClass = STATUS_COLORS[currentStatus];
        
        if (colorClass) {
            label.classList.add(colorClass);
        } else {
            // Si el estado es nuevo o desconocido, gris por seguridad
            label.classList.add('text-gray-400');
            console.warn(`⚠️ Estado sin color definido: "${currentStatus}"`);
        }
    }

    // 3. Gestión de Bloqueo de Inputs (Deshabilitar si el bot está operando)
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