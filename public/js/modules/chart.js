// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo) con Indicadores Persistentes
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Limpieza y preparación del contenedor
    container.innerHTML = '';
    container.style.height = "500px"; 
    container.style.width = "100%";

    // 2. Recuperar preferencia de temporalidad (por defecto '1' para 1 minuto)
    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    // 3. Crear el widget con los 3 indicadores solicitados
    new TradingView.widget({
        "autosize": true,
        "symbol": `BITMART:${symbol}`,
        "interval": savedInterval,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#111827",
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "container_id": containerId,
        "support_host": "https://www.tradingview.com",
        
        // 🟢 INDICADORES FORZADOS POR CÓDIGO
        "studies": [
            "RSI@tv-basicstudies",      // Índice de Fuerza Relativa
            "BB@tv-basicstudies",       // Bandas de Bollinger
            "MACD@tv-basicstudies"      // Convergencia/Divergencia del Promedio Móvil
        ],
        
        "overrides": {
            "mainSeriesProperties.style": 1,
            "paneProperties.background": "#111827",
            "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.05)",
            "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.05)",
            // Ajuste para que el MACD no ocupe toda la pantalla
            "paneProperties.legendProperties.showStudyArguments": true,
            "paneProperties.legendProperties.showStudyTitles": true,
            "paneProperties.legendProperties.showStudyValues": true,
        }
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Muestra el historial de ganancias por ciclo.
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    if (!data || data.length === 0) return;

    const labels = data.map((_, i) => `Ciclo ${i + 1}`);
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; 

    switch (parameter) {
        case 'durationHours':
            dataPoints = data.map(c => parseFloat(c.durationHours || 0));
            labelText = 'Duración (Horas)';
            color = '#f59e0b';
            break;
        case 'initialInvestment':
            dataPoints = data.map(c => parseFloat(c.initialInvestment || 0));
            labelText = 'Inversión Inicial (USDT)';
            color = '#3b82f6';
            break;
        default:
            dataPoints = data.map(c => parseFloat(c.accumulatedProfit || c.netProfit || 0));
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981';
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointHoverRadius: 6,
                tension: 0.4, 
                fill: true,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: color,
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toLocaleString()} USDT`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                }
            }
        }
    });
}