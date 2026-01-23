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

export function updateControlsState(state) {
    if (!state) return;
    
    // Normalizamos estados para evitar undefined (Causa de botones rojos erróneos)
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED';

    // Lista completa de inputs para bloquear/desbloquear
    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'aupricestep-l', 'autriggerl'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'aupricestep-s', 'autriggers'];

    // Actualización de Botones y Labels (updateButtonState debe manejar el label internamente)
    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
    
    // Sincronización extra de Labels de texto para asegurar persistencia visual
    const lLabel = document.getElementById('aubot-lstate');
    if (lLabel) lLabel.textContent = lState;
    
    const sLabel = document.getElementById('aubot-sstate');
    if (sLabel) sLabel.textContent = sState;
}

export { displayMessage };