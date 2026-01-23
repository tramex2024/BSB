// public/js/modules/ui/controls.js

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'];

// ASEGÚRATE DE QUE ESTE OBJETO ESTÉ EXACTAMENTE ASÍ
const STATUS_COLORS = {
    RUNNING: 'text-emerald-400',
    STOPPED: 'text-red-400',
    BUYING: 'text-blue-400',
    SELLING: 'text-yellow-400',
    NO_COVERAGE: 'text-purple-400',
    PAUSED: 'text-orange-400'
};

export function updateButtonState(btnId, status, type, inputIds = []) {
    if (status === undefined || status === null) return;

    const btn = document.getElementById(btnId);
    const labelId = `aubot-${type.toLowerCase()}state`;
    const label = document.getElementById(labelId);
    
    // Forzamos limpieza de strings
    const currentStatus = status.toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // 1. Botón (Fondo Rojo o Esmeralda)
    if (btn) {
        btn.textContent = isBusy ? `STOP ${type}` : `START ${type}`;
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        if (isBusy) btn.classList.add('bg-red-600');
        else btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
    }

    // 2. Label (Color del Texto y Tamaño)
    if (label) {
        label.textContent = currentStatus;
        
        // Aumentar tamaño (Ya dijiste que esto está perfecto)
        label.classList.remove('text-[9px]', 'text-[10px]', 'text-xs');
        label.classList.add('text-[12px]', 'font-bold'); 

        // LIMPIEZA DE COLORES (Incluyendo text-white por si acaso)
        label.classList.remove(
            'text-white', 'text-gray-400',
            'text-emerald-400', 'text-red-400', 'text-blue-400', 
            'text-yellow-400', 'text-purple-400', 'text-orange-400'
        );
        
        // ASIGNACIÓN DE COLOR
        const colorClass = STATUS_COLORS[currentStatus];
        
        if (colorClass) {
            label.classList.add(colorClass);
            // Consola para debuguear si sigue fallando
            console.log(`Aplicando color ${colorClass} al estado ${currentStatus}`);
        } else {
            label.classList.add('text-gray-400');
            console.warn(`No se encontró color para: "${currentStatus}"`);
        }
    }

    // 3. Inputs
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