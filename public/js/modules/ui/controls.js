/**
 * ui/controls.js - Gestión de Botones e Inputs
 * ETAPA 1 FINAL: Eliminación total de parpadeo mediante persistencia de estado.
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

document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') {
        activeEdits[e.target.id] = Date.now();
    }
});

/**
 * Actualiza el estado visual de los botones (Start/Stop)
 * BLOQUEO DE PARPADEO: Solo actúa si el estado cambia.
 */
export function updateButtonState(btnId, status, type, inputIds = []) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const currentStatus = (status || 'STOPPED').toString().toUpperCase().trim();
    const isBusy = BUSY_STATES.includes(currentStatus);

    // --- 1. Sincronización de Label (Texto de estado arriba del botón) ---
    const typeKey = type.charAt(0).toLowerCase(); 
    const labelId = `aubot-${typeKey}state`; 
    const label = document.getElementById(labelId);

    if (label && label.textContent !== currentStatus) {
        label.textContent = currentStatus;
        label.style.color = STATUS_COLORS[currentStatus] || '#9ca3af';
    }

    // --- 2. Lógica de Persistencia del Botón (EVITA EL FLASH) ---
    // Usamos el dataset del botón para saber qué estado tiene actualmente dibujado
    if (btn.dataset.lastAppliedStatus === currentStatus) {
        return; // SI EL ESTADO NO CAMBIÓ, ABORTAMOS TODO. NO TOCAMOS EL DOM.
    }

    const suffix = (type === 'AI') ? 'AI CORE' : type.toUpperCase();
    const newText = isBusy ? `STOP ${suffix}` : `START ${suffix}`;
    
    // Actualización Atómica de Texto
    const spanText = btn.querySelector('.btn-text') || btn; 
if (spanText.innerText !== newText) {
    // Si el botón tiene un icono, no queremos borrarlo con textContent
    const icon = btn.querySelector('i');
    btn.innerHTML = ''; // Limpiamos
    if (icon) btn.appendChild(icon); // Mantenemos el icono
    const textNode = document.createTextNode(` ${newText}`);
    btn.appendChild(textNode);
}

    // Actualización Atómica de Clases (Sin parpadeo)
    if (isBusy) {
        // En lugar de remover todo, reemplazamos específicamente
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

    // Guardamos el nuevo estado para la próxima comparación
    btn.dataset.lastAppliedStatus = currentStatus;

    // --- 3. Bloqueo de Seguridad para Inputs ---
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (document.activeElement !== el) {
                // Solo cambiar si es estrictamente necesario
                if (el.disabled !== isBusy) {
                    el.disabled = isBusy;
                    el.style.opacity = isBusy ? "0.6" : "1";
                    el.style.cursor = isBusy ? "not-allowed" : "text";
                }
            }
        }
    });
}

/**
 * Sincroniza los valores de los inputs (Sin cambios drásticos, solo optimización)
 */
export function syncInputsFromConfig(conf) {
    if (!conf) return;

    const mapping = {
        'auamountl-usdt': conf.long?.amountUsdt,
        'aupurchasel-usdt': conf.long?.purchaseUsdt,
        'auincrementl': conf.long?.size_var,
        
        // MAPEOS CORRECTOS (Sin cruces artificiales)
        'audecrementl': conf.long?.price_var,       // Safety Drop -> price_var
        'autriggerl': conf.long?.profit_percent,   // Take Profit -> profit_percent
        
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

    const now = Date.now();

    for (const [id, value] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) continue;

        const lastEdit = activeEdits[id] || 0;
        const isFreshlyEdited = (now - lastEdit < 3000);

        if (document.activeElement === input || isFreshlyEdited) continue; 

        const currentVal = parseFloat(input.value) || 0;
        const newVal = parseFloat(value) || 0;

        if (Math.abs(currentVal - newVal) > 0.000001) {
            input.value = value;
        }
    }
    
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