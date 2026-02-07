/**
 * ui/controls.js - Gestión de Botones e Inputs
 * Ajuste: Eliminación de parpadeo y unificación de estados.
 */

const BUSY_STATES = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED']; 

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',
};

export const activeEdits = {};

// Registrar cuando el usuario está escribiendo para no sobrescribir sus datos
document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') {
        activeEdits[e.target.id] = Date.now();
    }
});

/**
 * Actualiza el estado visual de los botones (Start/Stop)
 * Evita el parpadeo comparando el estado antes de cambiar clases.
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // 1. Actualizar etiqueta de texto de estado (ej: "RUNNING" en color verde)
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label) {
        if (label.textContent !== currentStatus) {
            label.textContent = currentStatus;
            label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
        }
    }

    // 2. Lógica del Botón (Texto y Color)
    const suffix = (type === 'AI') ? 'AI CORE' : type.toUpperCase();
    const newText = isBusy ? `STOP ${suffix}` : `START ${suffix}`;
    
    // Solo cambiar el texto si es diferente (evita parpadeo)
    if (btn.textContent !== newText) {
        btn.textContent = newText;
    }

    // Cambiar colores usando clases de Tailwind
    if (isBusy) {
        btn.classList.remove('bg-emerald-600', 'bg-blue-600', 'hover:bg-blue-500', 'hover:bg-emerald-500');
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
    } else {
        btn.classList.remove('bg-red-600', 'hover:bg-red-500');
        if (type === 'AI') {
            btn.classList.add('bg-blue-600', 'hover:bg-blue-500');
        } else {
            btn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
        }
    }

    // 3. Bloqueo de Seguridad para Inputs
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // No bloquear si el usuario tiene el foco puesto en ese input
            if (document.activeElement !== el) {
                el.disabled = isBusy;
                el.style.opacity = isBusy ? "0.6" : "1";
                el.style.cursor = isBusy ? "not-allowed" : "text";
            }
        }
    });
}

/**
 * Sincroniza los valores de los inputs con la configuración de la BD
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
        'auamountai-usdt': conf.ai?.amountUsdt,
        'ai-amount-usdt': conf.ai?.amountUsdt // Sincroniza ambos inputs de AI si existen
    };

    const now = Date.now();

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        const lastEdit = activeEdits[id] || 0;
        const isFreshlyEdited = (now - lastEdit < 3000); // Protección de 3 segundos

        // Si el usuario está escribiendo o editó hace poco, saltamos este input
        if (document.activeElement === input || isFreshlyEdited) {
            continue; 
        }

        const currentVal = parseFloat(input.value) || 0;
        const newVal = parseFloat(value) || 0;

        // Solo actualizar si hay una diferencia real (evita mover el cursor del usuario)
        if (Math.abs(currentVal - newVal) > 0.000001) {
            input.value = value;
        }
    }
    
    // Sincronización de Checkboxes de "Stop at Cycle"
    ['long', 'short', 'ai'].forEach(side => {
        const ids = [`au-stop-${side}-at-cycle`, `ai-stop-at-cycle`].filter(i => side === 'ai' || i.includes(side));
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            
            const val = !!conf[side]?.stopAtCycle;
            const lastEdit = activeEdits[id] || 0;

            if (document.activeElement !== el && (now - lastEdit >= 3000)) {
                if (el.checked !== val) el.checked = val;
            }
        });
    });
}