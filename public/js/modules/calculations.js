// public/js/modules/calculations.js

// Función para actualizar los cálculos principales del Autobot
export function actualizarCalculosAutobot() {
    // Obtener los elementos del DOM
    const purchaseUSDTInput = document.getElementById("purchase-usdt");
    const purchaseBTCInput = document.getElementById("purchase-btc");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");
    const priceElement = document.getElementById('price');
    const orqElement = document.getElementById('orq');
    const coverageElement = document.getElementById('coverage');

    // Salir si no se encuentran los elementos necesarios
    if (!purchaseUSDTInput || !purchaseBTCInput || !incrementInput || !decrementInput || !triggerInput || !priceElement) {
        console.warn("Advertencia: No se encontraron todos los elementos para los cálculos principales del autobot.");
        return;
    }

    const purchaseUSDT = parseFloat(purchaseUSDTInput.value);
    const purchaseBTC = parseFloat(purchaseBTCInput.value);
    const increment = parseFloat(incrementInput.value);
    const decrement = parseFloat(decrementInput.value);
    const trigger = parseFloat(triggerInput.value);
    const currentPrice = parseFloat(priceElement.textContent);

    // Realizar cálculos solo si los valores son números válidos
    if (!isNaN(purchaseUSDT) && !isNaN(purchaseBTC) && !isNaN(increment) && !isNaN(decrement) && !isNaN(trigger) && !isNaN(currentPrice)) {
        // Los cálculos 'orq' y 'coverage' que tenías en tu archivo original
        const orq = purchaseUSDT * (increment / 100) / 100;
        const coverage = (currentPrice / (currentPrice * (1 - decrement / 100)) - 1) * 100;

        // Actualizar los elementos de la interfaz si existen
        if (orqElement) orqElement.textContent = orq.toFixed(2);
        if (coverageElement) coverageElement.textContent = coverage.toFixed(2);
    }
}


// --- Lógica para el LBalance y SBalance ---
// Esta función actualiza los balances disponibles en función de los inputs de la estrategia.

export function actualizarBalancesEstrategia() {
    // 1. Obtener las referencias a los inputs y displays usando los IDs de tu HTML
    const amountUSDTInput = document.getElementById('amount-usdt');
    const amountBTCInput = document.getElementById('amount-btc');
    const lbalanceDisplay = document.getElementById('lbalance');
    const sbalanceDisplay = document.getElementById('sbalance');

    if (!amountUSDTInput || !amountBTCInput || !lbalanceDisplay || !sbalanceDisplay) {
        console.warn("Advertencia: No se encontraron los elementos de balance para la estrategia.");
        return;
    }

    // 2. Definir las funciones de cálculo y actualización
    const updateLBalance = () => {
        const amountUSDT = parseFloat(amountUSDTInput.value) || 0;
        // Lógica actual: LBalance es igual al Amount(USDT) total.
        // Más adelante, aquí se podría restar el valor de las órdenes abiertas.
        lbalanceDisplay.textContent = amountUSDT.toFixed(2);
    };

    const updateSBalance = () => {
        const amountBTC = parseFloat(amountBTCInput.value) || 0;
        // Lógica actual: SBalance es igual al Amount(BTC) total.
        // Más adelante, aquí se podría restar el valor de las órdenes abiertas.
        sbalanceDisplay.textContent = amountBTC.toFixed(8);
    };

    // 3. Añadir los escuchadores de eventos para la actualización en tiempo real
    amountUSDTInput.addEventListener('input', updateLBalance);
    amountBTCInput.addEventListener('input', updateSBalance);

    // 4. Llamar a las funciones para inicializar los valores al cargar la página
    updateLBalance();
    updateSBalance();
}