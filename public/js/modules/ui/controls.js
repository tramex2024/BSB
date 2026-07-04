/**
 * ui/controls.js - Gestión de Botones e Inputs
 * ETAPA 1 FINAL: Eliminación total de parpadeo mediante persistencia y cerraduras transaccionales.
 */

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981', // Verde esmeralda
    'STOPPED': '#ef4444', // Rojo
    'BUYING': '#60a5fa',  // Azul
    'SELLING': '#fbbf24', // Amarillo
    'PAUSED': '#fb923c',  // Naranja
};

/**
 * 🔐 REGISTRO DE CERRADURAS TRANSACCIONALES
 * Reemplaza los parches de tiempo por control de flujo asíncrono real.
 */
export const uiLocks = {
    _activeIds: new Set(),
    
    acquire(id) {
        this._activeIds.add(id);
    },
    
    release(id) {
        this._activeIds.delete(id);
    },
    
    isLocked(id) {
        return this._activeIds.has(id);
    },
    
    clearAll() {
        this._activeIds.clear();
    }
};

/**
 * Actualiza el estado visual de los botones (Start/Stop)
 * BLOQUEO DE PARPADEO: Solo actúa si el estado cambia.
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // --- 1. Sincronización de Label ---
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label) {
        if (label.textContent !== currentStatus) {
            label.textContent = currentStatus;
        }
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
        label.classList.remove('text-white', 'text-blue-500', 'text-emerald-500', 'text-red-500');
    }

    // --- 2. Lógica de Persistencia del Botón (EVITA EL FLASH) ---
    if (btn.dataset.lastAppliedStatus === currentStatus) {
        return; 
    }

    const suffix = (type === 'AI') ? 'AI CORE' : type.toUpperCase();
    const newText = isBusy ? `STOP ${suffix}` : `START ${suffix}`;
    
    const spanText = btn.querySelector('.btn-text') || btn; 
    if (spanText.innerText !== newText) {
        const icon = btn.querySelector('i');
        btn.innerHTML = ''; 
        if (icon) btn.appendChild(icon); 
        const textNode = document.createTextNode(` ${newText}`);
        btn.appendChild(textNode);
    }

    btn.classList.remove('bg-emerald-600', 'bg-blue-600', 'bg-red-600', 'hover:bg-blue-500', 'hover:bg-emerald-500', 'hover:bg-red-500');
    
    if (isBusy) {
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
    } else {
        btn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
    }

    btn.dataset.lastAppliedStatus = currentStatus;

    // --- 3. Bloqueo de Seguridad para Inputs ---
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            if (el.disabled !== isBusy) {
                el.disabled = isBusy;
                el.style.opacity = isBusy ? "0.6" : "1";
                el.style.cursor = isBusy ? "not-allowed" : "text";
            }
        }
    });
}

/**
 * Sincroniza los valores de los inputs provenientes del WebSocket/Configuración del servidor
 */
export function syncInputsFromConfig(conf) {
    if (!conf) return;

    const mapping = {
        'auamountl-usdt': conf.long?.amountUsdt,
        'aupurchasel-usdt': conf.long?.purchaseUsdt,
        'auincrementl': conf.long?.size_var,
        'audecrementl': conf.long?.price_var,       
        'autriggerl': conf.long?.profit_percent,   
        'aupricestep-l': conf.long?.price_step_inc,
        
        'auamounts-usdt': conf.short?.amountUsdt,
        'aupurchases-usdt': conf.short?.purchaseUsdt,
        'auincrements': conf.short?.size_var,
        'audecrements': conf.short?.price_var,
        'autriggers': conf.short?.profit_percent,
        'aupricestep-s': conf.short?.price_step_inc,
        
        'auamountai-usdt': conf.ai?.amountUsdt,
        'ai-amount-usdt': conf.ai?.amountUsdt
    };

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        // 🛡️ EL ESCUDO DEFINITIVO: Si el usuario tiene el foco puesto O la llave está bloqueada por red, se ignora el WebSocket
        if (document.activeElement === input || uiLocks.isLocked(id)) {
            continue; 
        }

        const currentVal = parseFloat(input.value) || 0;
        const newVal = parseFloat(value) || 0;

        if (Math.abs(currentVal - newVal) > 0.000001) {
            input.value = value;
        }
    }
    
    // Sincronización de switches / checkboxes de ciclos
    ['long', 'short', 'ai'].forEach(side => {
        const ids = [`au-stop-${side}-at-cycle`, `ai-stop-at-cycle`].filter(i => side === 'ai' || i.includes(side));
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el || uiLocks.isLocked(id)) return;
            
            const val = !!conf[side]?.stopAtCycle;
            if (document.activeElement !== el && el.checked !== val) {
                el.checked = val;
            }
        });
    });
}

/**
 * 🎯 ENCAPSULADOR DE EVENTOS (Factory)
 * Une el control de concurrencia (Locks) con la lógica de persistencia.
 */
export function setupBotInput(id, strategy, isStructural = false) {
    const el = document.getElementById(id);
    if (!el) return;

    // 1. Bloqueo de concurrencia: Evita que el WebSocket sobrescriba mientras el usuario escribe
    el.addEventListener('focus', () => uiLocks.acquire(id));
    el.addEventListener('blur', () => uiLocks.release(id));

    el.addEventListener('change', async (e) => {
        const newVal = parseFloat(e.target.value);
        if (isNaN(newVal)) return;

        // Actualización optimista local
        // Nota: Asegúrate de tener acceso a currentBotState o importarlo
        // En un patrón de arquitectura limpia, esto podría ir a un stateManager
        
        const payload = {
            config: { 
                [strategy]: { 
                    [e.target.dataset.key || 'amountUsdt']: newVal 
                } 
            },
            strategy: strategy,
            recalculate: isStructural, // <--- LA CLAVE DEL RENDIMIENTO
            applyShield: true
        };

        try {
            await sendConfigToBackend(payload);
            console.log(`✅ ${strategy.toUpperCase()} ${isStructural ? 'STRUCTURAL' : 'PARAM'} UPDATED: ${newVal}`);
        } catch (err) {
            console.error(`❌ Sync error on ${id}:`, err);
        } finally {
            uiLocks.release(id);
        }
    });
}

// Al final de public/js/ui/controls.js
export const activeEdits = {};