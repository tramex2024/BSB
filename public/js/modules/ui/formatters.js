export function formatCurrency(el, price, lastPrice) {
    const currentPrice = Number(price);
    const formatted = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (el.textContent !== formatted) {
        el.className = `text-lg font-mono font-bold leading-none ${
            lastPrice !== 0 ? (currentPrice > lastPrice ? 'text-emerald-400' : (currentPrice < lastPrice ? 'text-red-400' : 'text-white')) : 'text-white'
        }`;
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
        el.className = `text-lg font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
}

export function formatValue(el, rawValue, isBtc = false, isInteger = false) {
    if (rawValue === undefined || rawValue === null) return;
    const value = Number(rawValue);
    if (isNaN(value)) return;

    const decimals = isBtc ? 6 : (isInteger ? 0 : 2);
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    
    if (el.textContent !== formatted) {
        el.textContent = formatted;
    }
}