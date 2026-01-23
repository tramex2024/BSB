// public/js/modules/ui/controls.js

/**
 * ESTADOS ACTIVOS (BUSY)
 * Si el bot está en cualquiera de estos 4 estados, el botón debe ser ROJO (STOP)
 * y los inputs deben estar bloqueados para evitar errores en las órdenes.
 */
const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

/**
 * Actualiza el estado visual de los botones y labels según la base de datos
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    // Si no hay estado definido (carga inicial), no hacemos cambios erróneos
    if (status === undefined || status === null) return;

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    // Normalizamos el estado que viene del servidor (tus 5 estados originales)
    const currentStatus = status.toString().toUpperCase();
    
    // Evaluamos si el estado actual pertenece a los que bloquean la UI
    const isBusy = BUSY_STATES.includes(currentStatus);

    // 1. Actualizar el Botón (Visual y Texto)
    if (btn) {
        // Si está ocupado (RUNNING/BUYING/etc), el botón permite DETENER (STOP)
        // Si no está en la lista (STOPPED), el botón permite INICIAR (START)
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        
        if (isBusy) {
            btn.classList.add('bg-red-600'); // Rojo para acción de parada
        } else {
            // Color según el tipo de bot cuando está en STOPPED
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // 2. Actualizar el Label de Estado Informativo
    if (label) {
        // Mostramos el estado real (STOPPED, BUYING, SELLING, etc.)
        label.textContent = currentStatus; 
        label.classList.remove('text-emerald-400', 'text-red-400');
        
        // Verde para estados de actividad, Rojo para estado detenido
        label.classList.add(isBusy ? 'text-emerald-400' : 'text-red-400');
    }

    // 3. Gestión de Bloqueo de Inputs
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