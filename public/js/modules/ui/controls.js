// public/js/modules/ui/controls.js

// ✅ Restauramos la constante vital que faltaba
const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      // Esmeralda
    'STOPPED': '#ef4444',      // Rojo
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo    
    'PAUSED': '#fb923c'    
};

export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    const typeLabel = type.toUpperCase();
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    // 1. Etiqueta de estado (texto arriba del botón)
    if (label) {
        label.textContent = currentStatus;
        // Verde si está activo, gris azulado si está parado
        label.style.color = isBusy ? '#10b981' : '#64748b'; 
    }

    // 2. El Botón: Forzamos Verde o Rojo
   if (btn) {
    btn.disabled = false;
    btn.style.opacity = "1";
    
    // 1. Siempre quitamos ambos colores para limpiar el rastro
    btn.classList.remove('bg-emerald-600', 'bg-red-600');
    
    // 2. Aplicamos el que corresponde según el estado
    if (isBusy) {
        btn.textContent = `STOP ${type.toUpperCase()}`;
        btn.classList.add('bg-red-600');
    } else {
        btn.textContent = `START ${type.toUpperCase()}`;
        btn.classList.add('bg-emerald-600');
    }
}

    // 3. Inputs: Se habilitan si NO está busy
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isBusy;
            el.style.opacity = isBusy ? "0.5" : "1";
        }
    });
}

/**
 * Recolecta datos de la UI
 */
export function collectConfigFromUI() {
    const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getVal('auamountl-usdt'),
            purchaseUsdt: getVal('aupurchasel-usdt'),
            size_var: getVal('auincrementl'),
            price_var: getVal('audecrementl'),
            price_step_inc: getVal('aupricestep-l'),
            profit_percent: getVal('autriggerl'),
            stopAtCycle: getCheck('au-stop-long-at-cycle')
        },
        short: {
            amountUsdt: getVal('auamounts-usdt'),
            purchaseUsdt: getVal('aupurchases-usdt'),
            size_var: getVal('auincrements'),
            price_var: getVal('audecrements'),
            price_step_inc: getVal('aupricestep-s'),
            profit_percent: getVal('autriggers'),
            stopAtCycle: getCheck('au-stop-short-at-cycle')
        }
    };
}

/**
 * Sincroniza inputs desde la configuración
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
        'autriggers': conf.short?.profit_percent
    };

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (input && value !== undefined && document.activeElement !== input) {
            input.value = value;
        }
    }
    
    ['long', 'short'].forEach(side => {
        const el = document.getElementById(`au-stop-${side}-at-cycle`);
        if (el && document.activeElement !== el) {
            el.checked = !!conf[side]?.stopAtCycle;
        }
    });
}