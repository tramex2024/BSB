// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo) con Indicadores Persistentes
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    
    // --- AMPLIACIÓN HACIA ABAJO ---
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
            "paneProperties.legendProperties.showStudyArguments": true,
            "paneProperties.legendProperties.showStudyTitles": true,
            "paneProperties.legendProperties.showStudyValues": true,
        }
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Versión Ultra-Blindada: Reseteo de contexto y gradientes dinámicos
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    const ctx = canvas.getContext('2d');

    // 1. DESTRUCCIÓN TOTAL Y LIMPIEZA DE CANVAS
    if (equityChartInstance) {
        equityChartInstance.destroy();
        equityChartInstance = null;
    }
    // Limpiamos el rectángulo para evitar "fantasmas" visuales
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const hasData = rawPoints.length > 0;
    const points = hasData ? rawPoints : [{ time: 'Esperando datos...', value: 0 }];

    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; 

    // 2. SELECCIÓN DE PARÁMETRO
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
                if (c.value !== undefined) return parseFloat(c.value);
                return parseFloat(c.accumulatedProfit || c.netProfit || 0);
            });
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981';
    }

    // 3. CREACIÓN DE GRADIENTE SEGURO
    // Usamos la altura del canvas real para el gradiente
    const chartHeight = canvas.clientHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    // 4. NUEVA INSTANCIA
    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: hasData ? color : 'rgba(255, 255, 255, 0.2)',
                backgroundColor: gradient,
                borderWidth: 2, // Bajado a 2 para mayor elegancia
                pointBackgroundColor: color,
                pointBorderColor: '#111827',
                pointBorderWidth: 1,
                pointHoverRadius: 5,
                tension: 0.3, // Menos tensión para evitar curvas extrañas en pocos puntos
                fill: true,
                pointRadius: (hasData && points.length < 40) ? 3 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400 // Animación rápida para que el cambio de filtro sea fluido
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasData,
                    backgroundColor: '#1f2937',
                    borderColor: color,
                    borderWidth: 1,
                    displayColors: false,
                    padding: 10,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toFixed(4)} USDT`
                    }
                }
            },
            scales: {
                y: {
                    // beginAtZero: true, // Quitamos esto si quieres ver mejor las variaciones pequeñas
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 10, family: 'monospace' },
                        callback: (value) => `$${value.toFixed(2)}` 
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6 // Menos ticks para evitar solapamiento
                    }
                }
            }
        }
    });
}