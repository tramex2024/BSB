/**
 * chart.js - Visualización de Rendimiento (Ultra-Blindada 2026)
 * Sincronizada para manejar flujos aditivos de MetricsManager.
 */

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo)
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    container.style.height = "650px"; 
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
            "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.08)",
            "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.08)",
        }
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    const ctx = canvas.getContext('2d');

    // 1. LIMPIEZA TOTAL
    if (equityChartInstance) {
        equityChartInstance.destroy();
        equityChartInstance = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const hasData = rawPoints.length > 0;
    
    // Si no hay datos, mostramos una línea base vacía
    const points = hasData ? rawPoints : [{ time: 'Esperando datos...', value: 0 }];

    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    let dataPoints = [];
    let labelText = 'Capital Acumulado (USDT)';
    let color = '#10b981'; 

    // 2. EXTRACCIÓN DE DATOS (Normalizada para MetricsManager)
    dataPoints = points.map(p => {
        const val = (typeof p.value === 'number') ? p.value : (p.netProfit || 0);
        return parseFloat(val.toFixed(4));
    });

    // 3. GRADIENTE DINÁMICO
    const chartHeight = canvas.clientHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    // 4. RENDERIZADO
    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: hasData ? color : 'rgba(255, 255, 255, 0.2)',
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: color,
                pointBorderColor: '#111827',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                tension: 0.35, 
                fill: true,
                pointRadius: (hasData && points.length < 50) ? 3 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasData,
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#ffffff',
                    borderColor: color,
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: (ctx) => ` $${ctx.parsed.y.toFixed(2)} USDT`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 10, family: 'monospace' },
                        callback: (v) => `$${v}` 
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 9 },
                        maxTicksLimit: 7 
                    }
                }
            }
        }
    });
}