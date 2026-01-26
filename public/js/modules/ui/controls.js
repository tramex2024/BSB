// public/js/modules/ui/controls.js

// ✅ QUITAMOS 'STOPPED' DE ESTA LISTA
const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      // Esmeralda
    'STOPPED': '#9ca3af',      // Gris (Cambiado de rojo a gris para que no asuste)
    'BUYING': '#60a5fa',       // Azul
    'SELLING': '#fbbf24',      // Amarillo    
    'PAUSED': '#fb923c'    
};

export function updateButtonState(btnId, status, type, inputIds = []) {
    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    
    // Ahora 'STOPPED' devolverá FALSE aquí
    const isBusy = BUSY_STATES.includes(currentStatus);

    const btn = document.getElementById(btnId);
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    // 1. ACTUALIZAR ETIQUETA
    if (label) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
    }

    // 2. ACTUALIZAR BOTÓN
    if (btn) {
        // Si no está busy (ej: STOPPED), dirá "START"
        btn.textContent = isBusy ? `STOP ${type.charAt(0)}` : `START ${type.charAt(0)}`;
        
        if (isBusy) {
            btn.classList.remove('bg-emerald-600');
            btn.classList.add('bg-red-600');
        } else {
            // Cuando sea STOPPED, entrará aquí y se pondrá verde/esmeralda para invitar a iniciar
            btn.classList.remove('bg-red-600');
            btn.classList.add('bg-emerald-600');
        }
        btn.disabled = false;
    }

    // 3. GESTIÓN DE INPUTS (Ahora se desbloquean al estar STOPPED)
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
 * ✅ NUEVA FUNCIÓN: Recolecta los datos de la web para enviarlos al servidor.
 * Úsala en main.js antes de hacer el POST a /api/autobot/update-config
 */
export function collectConfigFromUI() {
    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: parseFloat(document.getElementById('auamountl-usdt')?.value) || 0,
            purchaseUsdt: parseFloat(document.getElementById('aupurchasel-usdt')?.value) || 0,
            size_var: parseFloat(document.getElementById('auincrementl')?.value) || 0,
            price_var: parseFloat(document.getElementById('audecrementl')?.value) || 0,
            price_step_inc: parseFloat(document.getElementById('aupricestep-l')?.value) || 0,
            profit_percent: parseFloat(document.getElementById('autriggerl')?.value) || 0,
            stopAtCycle: document.getElementById('au-stop-long-at-cycle')?.checked || false
        },
        short: {
            amountUsdt: parseFloat(document.getElementById('auamounts-usdt')?.value) || 0,
            purchaseUsdt: parseFloat(document.getElementById('aupurchases-usdt')?.value) || 0,
            size_var: parseFloat(document.getElementById('auincrements')?.value) || 0,
            price_var: parseFloat(document.getElementById('audecrements')?.value) || 0,
            price_step_inc: parseFloat(document.getElementById('aupricestep-s')?.value) || 0,
            profit_percent: parseFloat(document.getElementById('autriggers')?.value) || 0,
            stopAtCycle: document.getElementById('au-stop-short-at-cycle')?.checked || false
        }
    };
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
        'autriggers': conf.short?.profit_percent
    };

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (input && value !== undefined && document.activeElement !== input) {
            const newVal = parseFloat(value) || 0;
            input.value = newVal;
        }
    }
    
    // Checkboxes
    ['long', 'short'].forEach(side => {
        const el = document.getElementById(`au-stop-${side}-at-cycle`);
        if (el && document.activeElement !== el) {
            el.checked = !!conf[side]?.stopAtCycle;
        }
    });
}