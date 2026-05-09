/**
 * formatters.js - Versión Optimizada para Trading de Alta Precisión
 */

/**
 * Formatea el precio de mercado con indicadores visuales de dirección.
 * @param {HTMLElement} el - Elemento del DOM a actualizar.
 * @param {number|string} price - Precio actual.
 * @param {number} lastPrice - Precio de la actualización anterior.
 * @returns {number} - Retorna el precio actual para ser almacenado como lastPrice.
 */
export function formatCurrency(el, price, lastPrice) {
    const currentPrice = Number(price);
    // Usamos 2 decimales fijos para el precio de mercado principal (estándar USDT)
    const formatted = `$${currentPrice.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
    
    if (el.textContent !== formatted) {
        let colorClass = 'text-white';
        
        if (lastPrice !== 0) {
            // Lógica de color según tendencia inmediata
            if (currentPrice > lastPrice) colorClass = 'text-emerald-400';
            else if (currentPrice < lastPrice) colorClass = 'text-red-400';
        }

        // Aplicamos clases de Tailwind para rendimiento y transiciones suaves
        el.className = `text-lg font-mono font-bold leading-none transition-colors duration-300 ${colorClass}`;
        el.textContent = formatted;

        // Efecto visual: Reseteo de color para resaltar nuevos cambios de precio
        setTimeout(() => {
            if (el) el.classList.remove('text-emerald-400', 'text-red-400');
        }, 800);
    }
    return currentPrice;
}

/**
 * Formatea valores de PnL (Profit and Loss).
 * @param {HTMLElement} el - Elemento del DOM.
 * @param {number|string} value - El beneficio neto.
 */
export function formatProfit(el, value) {
    if (value === undefined || value === null) return;
    const val = Number(value);
    const sign = val >= 0 ? '+' : '';
    
    // Para profit, usamos 4 decimales para detectar pequeñas variaciones
    const formatted = `${sign}$${val.toLocaleString('en-US', { 
        minimumFractionDigits: 4, 
        maximumFractionDigits: 4 
    })}`;
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
        // Color estático basado en si hay ganancia o pérdida
        el.className = `text-lg font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
}

/**
 * Formateador genérico para balances y cantidades.
 * @param {HTMLElement} el - Elemento del DOM.
 * @param {number|string} rawValue - Valor crudo.
 * @param {boolean} isBtc - Si es verdadero, aplica precisión de 8 decimales.
 * @param {boolean} isInteger - Si es verdadero, elimina decimales.
 */
export function formatValue(el, rawValue, isBtc = false, isInteger = false) {
    if (rawValue === undefined || rawValue === null) return;
    const value = Number(rawValue);
    if (isNaN(value)) return;

    // Lógica de precisión dinámica
    let decimals = isBtc ? 8 : (isInteger ? 0 : 2);
    
    // Mejora: Si no es BTC ni entero, pero el valor es menor a 0.01, 
    // aumentamos decimales para no mostrar 0.00
    if (!isBtc && !isInteger && value > 0 && value < 0.01) {
        decimals = 4;
    }

    const formatted = value.toLocaleString('en-US', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
    });
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
    }
}