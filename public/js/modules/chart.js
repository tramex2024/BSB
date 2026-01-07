// public/js/modules/chart.js

let equityChartInstance = null;

export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    container.style.height = "500px"; 
    container.style.width = "100%";

    // 1. Recuperar la temporalidad (ej: '1' para 1 minuto)
    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    // 2. Crear el widget con INDICADORES PRE-CONFIGURADOS
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
        
        // 🟢 ESTA ES LA CLAVE: Forzar indicadores al cargar
        "studies": [
            "RSI@tv-basicstudies", // Fuerza el RSI
            "MASimple@tv-basicstudies" // Ejemplo: Media Móvil Simple (opcional)
        ],
        
        // Configuraciones visuales para que no se pierdan
        "overrides": {
            "mainSeriesProperties.style": 1, // Velas
            "paneProperties.background": "#111827",
            "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.05)",
            "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.05)"
        }
    });
}

/**
 * Función auxiliar para guardar preferencias manualmente si fuera necesario
 * Puedes llamarla desde la consola o botones externos.
 */
export function saveChartPreferences(interval, style) {
    if (interval) localStorage.setItem('tv_preferred_interval', interval);
    if (style) localStorage.setItem('tv_preferred_style', style);
}

/**
 * Gráfico de Curva de Capital (Chart.js)
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
                    displayColors: false
                }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}