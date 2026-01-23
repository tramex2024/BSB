export function formatCurrency(el, price, lastPrice) {
    const currentPrice = Number(price);
    const formatted = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (el.textContent !== formatted) {
        // Determinamos la clase de color según la comparación con el precio anterior
        let colorClass = 'text-white';
        if (lastPrice !== 0) {
            if (currentPrice > lastPrice) colorClass = 'text-emerald-400';
            else if (currentPrice < lastPrice) colorClass = 'text-red-400';
            else return lastPrice; // Si el precio numérico es igual, no actualizamos DOM ni cambiamos color
        }

        // Actualizamos el DOM de forma atómica
        el.className = `text-lg font-mono font-bold leading-none ${colorClass}`;
        el.textContent = formatted;
    }
    return currentPrice;
}

export function formatProfit(el, value) {
    if (value === undefined || value === null) return;
    const val = Number(value);
    const sign = val >= 0 ? '+' : '';
    const formatted = `${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
        // Mantenemos la estructura de clases limpia
        el.className = `text-lg font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
}

export function formatValue(el, rawValue, isBtc = false, isInteger = false) {
    if (rawValue === undefined || rawValue === null) return;
    const value = Number(rawValue);
    if (isNaN(value)) return;

    const decimals = isBtc ? 6 : (isInteger ? 0 : 2);
    const formatted = value.toLocaleString('en-US', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
    });
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
    }
}