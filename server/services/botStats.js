// backend/services/botStats.js

/**
 * Calcula el cambio porcentual entre dos valores
 */
const calculatePercentChange = (current, reference) => {
    if (!reference || reference === 0) return 0;
    return ((current - reference) / reference) * 100;
};

/**
 * Emite las estadísticas actualizadas a través de Socket.io
 */
export const emitBotStats = (io, userId, currentPrice, initialInvestment, currentBalance) => {
    // 1. Supongamos que guardamos el precio de hace 24h en una base de datos o caché
    const price24hAgo = getPriceFromCache('BTC_24h'); 
    const priceChangePercent = calculatePercentChange(currentPrice, price24hAgo);

    // 2. Calculamos el Profit Total (Balance actual vs Inversión inicial)
    const totalProfit = currentBalance - initialInvestment;
    const profitChangePercent = calculatePercentChange(currentBalance, initialInvestment);

    // 3. Enviamos el paquete de datos al usuario específico
    io.to(userId).emit('bot-stats', {
        totalProfit: totalProfit,           // Ej: 15.50 (USDT)
        profitChangePercent: profitChangePercent, // Ej: 2.3 ( % )
        priceChangePercent: priceChangePercent    // Ej: -1.05 ( % )
    });
};