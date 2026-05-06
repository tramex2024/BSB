/**
 * chart.js - Visualización de Rendimiento (Versión Completa + Auditoría)
 * Estado: Optimizado para renderizado asíncrono y protección de contexto.
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

    if (window.TradingView) {
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
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {        
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. LIMPIEZA TOTAL DE INSTANCIA PREVIA
    if (equityChartInstance) {        
        equityChartInstance.destroy();
        equityChartInstance = null;
    }

    // 2. PROCESAMIENTO DE PUNTOS CON BLINDAJE
    // Si viene de un evento 'metricsUpdated', los puntos suelen estar en event.detail.points o event.detail
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const hasData = rawPoints.length > 0;
    
    // Si no hay datos, creamos una línea base estética
    const points = hasData ? rawPoints : [{ time: 'Esperando datos...', value: 0 }];

    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    const dataPoints = points.map(p => {
        let val = p.value !== undefined ? p.value : (p.netProfit || 0);
        return parseFloat(parseFloat(val).toFixed(4)); 
    });

    // 3. GRADIENTE DINÁMICO REFORZADO
    const chartHeight = canvas.offsetHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    const color = '#10b981'; 
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    // 4. CREACIÓN DE INSTANCIA
    try {
        equityChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capital Acumulado (USDT)',
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
                animation: { 
                    duration: 400,
                    easing: 'easeInOutQuad'
                },
                interaction: { 
                    intersect: false, 
                    mode: 'index' 
                },
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
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => ` Profit: $${ctx.parsed.y.toFixed(2)} USDT`
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false 
                        },
                        ticks: { 
                            color: '#9ca3af', 
                            font: { size: 10, family: 'monospace' },
                            callback: (v) => `$${v.toFixed(2)}` 
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: '#9ca3af', 
                            font: { size: 9 },
                            maxTicksLimit: 7,
                            maxRotation: 0
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("💥 CRASH en Chart.js:", err);
    }
}

/**
 * ESCUCHADOR DE EVENTOS DE MÉTRICAS
 * Se asegura de que la data pase por el renderizador sin importar el formato del evento.
 */
window.addEventListener('metricsUpdated', (event) => {
    if (!event.detail) return;
    
    // Si el evento trae un objeto con .points lo usamos, si no usamos el detail directamente
    const dataToRender = event.detail.points ? event.detail.points : event.detail;
    renderEquityCurve(dataToRender);
});