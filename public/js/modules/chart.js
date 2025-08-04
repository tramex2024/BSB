// public/js/modules/chart.js

// Asumimos que la biblioteca de TradingView ya está cargada en el HTML
let widget = null;

export function initializeChart(container, symbol) {
    if (widget) {
        // Si ya existe un widget, no hacemos nada o lo destruimos y creamos uno nuevo.
        // Para este caso, solo verificamos su existencia.
        console.log("El widget de TradingView ya está inicializado.");
        return;
    }

    console.log(`Inicializando gráfico de TradingView para el símbolo: ${symbol}`);
    widget = new TradingView.widget({
        "container_id": container.id,
        "autosize": true,
        "symbol": symbol,
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "support_host": "https://www.tradingview.com",
        "library_path": "/charting_library/",
        "disabled_features": [
            "header_saveload",
            "study_templates"
        ]
    });
}

// Puedes añadir una función para actualizar los datos si es necesario
export function updateChartData(newData) {
    // Lógica para actualizar el gráfico si ya está inicializado
    if (widget) {
        console.log("Actualizando datos del gráfico. (Esta función puede ser más compleja).");
        // Por ejemplo, para cambiar el símbolo:
        // widget.chart().setSymbol(newData.symbol);
    }
}