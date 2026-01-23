/**
 * uiManager.js - Orquestador Atómico de Interfaz
 * Refactorizado para máxima independencia y modularidad.
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state) return;

    // 1. Precio con detección de tendencia
    const priceEl = document.getElementById('auprice');
    if (priceEl && state.price != null) {
        lastPrice = formatCurrency(priceEl, state.price, lastPrice);
    }

    // 2. Mapping de valores numéricos con búsqueda flexible
    const elements = {
        auprofit: 'total_profit', 
        aulbalance: 'lbalance', 
        ausbalance: 'sbalance',
        aultprice: 'lppc', 
        austprice: 'sppc', 
        aulsprice: 'lsprice',
        ausbprice: 'sbprice', 
        aulcycle: 'lcycle', 
        auscycle: 'scycle',
        aulcoverage: 'lcoverage', 
        auscoverage: 'scoverage',
        'aulprofit-val': 'lprofit', 
        'ausprofit-val': 'sprofit',
        aulnorder: 'lnorder', 
        ausnorder: 'snorder',
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC'
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Búsqueda profunda de datos (Persistencia de DB)
        let val = state[key];
        
        if (val === undefined) {
            // Si el backend envía los datos dentro de un objeto 'stats' o con prefijos
            val = state.stats?.[key] || 
                  state.balances?.[key.replace('lastAvailable', '')] ||
                  state[`long_${key}`] || state[`short_${key}`];
        }

        if (id.includes('profit')) formatProfit(el, val);
        else formatValue(el, val, id.includes('btc'), id.match(/norder|cycle/));
    });

    // IMPORTANTE: Actualizar los Labels de estado lstate/sstate informativos
    if (state.lstate) {
        const lLabel = document.getElementById('aubot-lstate');
        if (lLabel) lLabel.textContent = state.lstate;
    }
    if (state.sstate) {
        const sLabel = document.getElementById('aubot-sstate');
        if (sLabel) sLabel.textContent = state.sstate;
    }

    if (state.config) syncInputsFromConfig(state.config);
}

export function updateControlsState(state) {
    if (!state) return;
    
    // Ejecutamos cada actualización de forma totalmente aislada
    updateButtonState('austartl-btn', state.lstate, 'LONG', ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl']);
    updateButtonState('austarts-btn', state.sstate, 'SHORT', ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements']);
    updateButtonState('austartai-btn', state.aistate, 'AI', ['auamountai-usdt']);
}

export { displayMessage };