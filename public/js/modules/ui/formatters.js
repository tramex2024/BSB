/**
 * formatters.js - Formateo de datos con alto rendimiento
 */

export function formatCurrency(el, price, lastPrice) {
    const currentPrice = Number(price);
    const formatted = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (el.textContent !== formatted) {
        let colorClass = 'text-white';
        if (lastPrice !== 0) {
            if (currentPrice > lastPrice) colorClass = 'text-emerald-400';
            else if (currentPrice < lastPrice) colorClass = 'text-red-400';
        }

        el.className = `text-lg font-mono font-bold leading-none transition-colors duration-300 ${colorClass}`;
        el.textContent = formatted;

        // Opcional: Volver a blanco tras 800ms para resaltar el cambio
        setTimeout(() => {
            if (el) el.classList.remove('text-emerald-400', 'text-red-400');
        }, 800);
    }
    return currentPrice;
}

export function formatProfit(el, value) {
    if (value === undefined || value === null) return;
    const val = Number(value);
    const sign = val >= 0 ? '+' : '';
    const formatted = `${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
        el.className = `text-lg font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
}

export function formatValue(el, rawValue, isBtc = false, isInteger = false) {
    if (rawValue === undefined || rawValue === null) return;
    const value = Number(rawValue);
    if (isNaN(value)) return;

    // ✅ BTC usa 8 decimales para precisión total de satoshis
    const decimals = isBtc ? 8 : (isInteger ? 0 : 2);
    const formatted = value.toLocaleString('en-US', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
    });
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
    }
}