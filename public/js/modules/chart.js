// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo) con Indicadores Persistentes
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    container.style.height = "500px"; 
    container.style.width = "100%";

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

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
        "studies": [
            "RSI@tv-basicstudies",      
            "BB@tv-basicstudies",       
            "MACD@tv-basicstudies"      
        ],
        "overrides": {
            "mainSeriesProperties.style": 1,
            "paneProperties.background": "#111827",
            "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.05)",
            "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.05)",
            "paneProperties.legendProperties.showStudyArguments": true,
            "paneProperties.legendProperties.showStudyTitles": true,
            "paneProperties.legendProperties.showStudyValues": true,
        }
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Optimizada para recibir puntos de tiempo formateados y aplicar degradado
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destrucción limpia de la instancia previa para evitar el error "Canvas in use"
    if (equityChartInstance) {
        equityChartInstance.destroy();
        equityChartInstance = null;
    }

    if (!data || data.length === 0) return;

    // Normalización de datos: manejamos tanto array directo como objeto {points: []}
    const points = Array.isArray(data) ? data : (data.points || []);
    if (points.length === 0) return;

    // --- Lógica de Etiquetas Inteligentes ---
    const labels = points.map((d, i) => d.time || `Ciclo ${i + 1}`);
    
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; 

    switch (parameter) {
        case 'durationHours':
            dataPoints = points.map(c => parseFloat(c.durationHours || 0));
            labelText = 'Duración (Horas)';
            color = '#f59e0b';
            break;
        case 'initialInvestment':
            dataPoints = points.map(c => parseFloat(c.initialInvestment || 0));
            labelText = 'Inversión Inicial (USDT)';
            color = '#3b82f6';
            break;
        default:
            dataPoints = points.map(c => {
                if (c.value !== undefined) return c.value;
                return parseFloat(c.accumulatedProfit || c.netProfit || 0);
            });
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981';
    }

    // Configuración del degradado (Sombras bajo la curva)
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, `${color}66`); // Opacidad inicial (verde suave)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Desvanecimiento a negro/transparente

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: color,
                pointBorderColor: '#111827',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                tension: 0.4, 
                fill: true,
                pointRadius: labels.length > 50 ? 0 : 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: color,
                    borderWidth: 1,
                    displayColors: false,
                    padding: 10,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toFixed(2)} USDT`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.08)', // Líneas horizontales finas visibles
                        drawBorder: false 
                    },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 10 },
                        callback: (value) => `$${value}` 
                    }
                },
                x: {
                    grid: { 
                        display: false // Usualmente el grid vertical se oculta para estética limpia
                    },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}