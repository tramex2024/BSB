/**
 * util/formatters.js
 * Centraliza la visualización de datos financieros según tus reglas de diseño.
 */

// 1. Para KPIs generales, Long Profit y Short Profit (4 decimales)
export const formatDashboardProfit = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0.0000";
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    });
};

// 2. Para los puntos y tooltips del gráfico de equidad (2 decimales)
export const formatChartTooltip = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};