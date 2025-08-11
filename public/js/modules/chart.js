// public/js/modules/chart.js

import { TradingView } from 'tradingview-widget';

// Variable para la instancia del gráfico
let tvChart = null;

export function initializeChart(containerId, symbol) {
    // Si ya existe un gráfico, lo eliminamos primero para evitar conflictos
    if (tvChart) {
        tvChart.remove();
        tvChart = null;
    }

    // Inicializa el nuevo gráfico
    tvChart = new TradingView.widget({
        "container_id": containerId,
        "symbol": symbol,
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "hotlist": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com",
        "charts_storage_url": "https://s3.tradingview.com/charts_storage/staging/",
        "charts_storage_api_version": "1.1",
        "client_id": "tradingview.com",
        "user_id": "tradingview.com",
        "study_templates": "Ichimoku Cloud"
    });

    console.log("Gráfico de TradingView inicializado para el símbolo:", symbol);
    return tvChart;
}