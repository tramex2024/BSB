/**
 * uiManager.js - Orquestador Atómico de Interfaz (Actualizado 2026)
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state) return;

    // 1. Precio con detección de tendencia (BTC actual)
    const priceEl = document.getElementById('auprice');
    if (priceEl && state.price != null) {
        lastPrice = formatCurrency(priceEl, state.price, lastPrice);
    }

    // 2. Mapping de valores numéricos (CORREGIDO PARA ESTRUCTURA PLANA)
    const elements = {
        auprofit: 'total_profit', 
        aulbalance: 'lbalance', 
        ausbalance: 'sbalance',
        
        // 🎯 CORRECCIÓN: Ahora muestran el TARGET (Objetivo), no el promedio
        aultprice: 'ltprice',  // Long Target Price
        austprice: 'stprice',  // Short Target Price
        
        // 📉 OPCIONAL: Precios Promedio (PPC)
        aultppc: 'lppc',       
        austppc: 'sppc',       

        aulsprice: 'lsprice',  // Precio de corte Trailing Long
        ausbprice: 'sbprice',  // Precio de corte Trailing Short
        
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
        
        // Búsqueda profunda si no está en la raíz
        if (val === undefined || val === null) {
            val = state.stats?.[key] || 
                  state.balances?.[key.replace('lastAvailable', '')];
        }

        // Aplicar formato según el tipo de dato
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else {
            const isBTC = id.includes('btc') || id.includes('sac') || id.includes('lac');
            const isSimple = id.match(/norder|cycle/);
            formatValue(el, val, isBTC, isSimple);
        }
    });

    // 3. Sincronización de Configuración
    if (state.config) syncInputsFromConfig(state.config);
}

/**
 * Sincroniza estados de ejecución con la interfaz
 */
export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED';

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'aupricestep-l', 'autriggerl'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'aupricestep-s', 'autriggers'];

    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
}

export { displayMessage };