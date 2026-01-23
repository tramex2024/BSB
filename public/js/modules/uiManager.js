/**
 * uiManager.js - Orquestador Atómico de Interfaz
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

    // 2. Mapping de valores numéricos
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
        
        let val = state[key];
        if (val === undefined) {
            val = state.stats?.[key] || 
                  state.balances?.[key.replace('lastAvailable', '')] ||
                  state[`long_${key}`] || state[`short_${key}`];
        }

        if (id.includes('profit')) formatProfit(el, val);
        else formatValue(el, val, id.includes('btc'), id.match(/norder|cycle/));
    });

    // 3. Sincronización de Configuración
    if (state.config) syncInputsFromConfig(state.config);
}

// public/js/modules/ui/uiManager.js

export function updateControlsState(state) {
    if (!state) return;
    
    // 1. Normalizamos estados
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED';

    // 2. Definimos inputs
    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'aupricestep-l', 'autriggerl'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'aupricestep-s', 'autriggers'];

    // 3. LLAMADA ÚNICA (Delegamos todo a controls.js)
    // Esta función ya gestiona el botón, los inputs y el LABEL de color
    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
    
    // --- BORRAMOS LAS LÍNEAS DE ABAJO QUE SOBRESCRIBÍAN LOS LABELS ---
    // (Ya no hacemos textContent aquí, porque matamos el color de updateButtonState)
}

export { displayMessage };