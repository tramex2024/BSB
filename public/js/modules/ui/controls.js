const RUNNING_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED'];

export function updateButtonState(btnId, status, type, inputIds = []) {
    // Si el estado no viene definido, ignoramos por completo para no afectar al botón vecino
    if (status === undefined) return;

    const btn = document.getElementById(btnId);
    const isAlive = RUNNING_STATES.includes(status.toUpperCase());

    if (btn) {
        btn.textContent = isAlive ? `STOP ${type}` : `START ${type}`;
        btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
        
        if (isAlive) {
            btn.classList.add('bg-red-600');
        } else {
            btn.classList.add(type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
        }
        
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // Bloqueo selectivo de inputs asociados a este botón
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isAlive;
            el.style.opacity = isAlive ? "0.5" : "1";
        }
    });
}

export function syncInputsFromConfig(conf) {
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
            if (Math.abs((parseFloat(value) || 0) - (parseFloat(input.value) || 0)) > 0.000001) {
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