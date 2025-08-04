// public/js/modules/calculations.js

// Función para actualizar todos los cálculos del Autobot
export function actualizarCalculosAutobot() {
    // Obtener las referencias de todos los inputs y displays del DOM
    const amountUSDTInput = document.getElementById('amount-usdt');
    const amountBTCInput = document.getElementById('amount-btc');
    const purchaseUSDTInput = document.getElementById("purchase-usdt");
    const purchaseBTCInput = document.getElementById("purchase-btc");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger"); // Nuevo input
    const priceElement = document.getElementById('price');
    
    // Displays para los balances
    const lbalanceDisplay = document.getElementById('lbalance');
    const sbalanceDisplay = document.getElementById('sbalance');

    // Displays para los cálculos de cobertura
    const lcoverageDisplay = document.getElementById('lcoverage');
    const lnorderDisplay = document.getElementById('lnorder');
    const scoverageDisplay = document.getElementById('scoverage');
    const snorderDisplay = document.getElementById('snorder');

    // Displays para los nuevos cálculos de precio objetivo
    const ltpriceDisplay = document.getElementById('ltprice');
    const stpriceDisplay = document.getElementById('stprice');

    // Verificar que todos los elementos existan
    if (!amountUSDTInput || !amountBTCInput || !purchaseUSDTInput || !purchaseBTCInput ||
        !incrementInput || !decrementInput || !triggerInput || !priceElement || 
        !lbalanceDisplay || !sbalanceDisplay || !lcoverageDisplay || !lnorderDisplay || 
        !scoverageDisplay || !snorderDisplay || !ltpriceDisplay || !stpriceDisplay) {
        console.warn("Advertencia: No se encontraron todos los elementos necesarios para los cálculos. La función no se ejecutará.");
        return;
    }

    // Convertir valores de los inputs a números
    const amountUSDT = parseFloat(amountUSDTInput.value) || 0;
    const amountBTC = parseFloat(amountBTCInput.value) || 0;
    const purchaseUSDT = parseFloat(purchaseUSDTInput.value) || 0;
    const purchaseBTC = parseFloat(purchaseBTCInput.value) || 0;
    const increment = parseFloat(incrementInput.value) || 0;
    const decrement = parseFloat(decrementInput.value) || 0;
    const trigger = parseFloat(triggerInput.value) || 0; // Nuevo valor de input
    const currentPrice = parseFloat(priceElement.textContent) || 0;

    // Verificar si los valores numéricos son válidos
    if (isNaN(amountUSDT) || isNaN(amountBTC) || isNaN(purchaseUSDT) || isNaN(purchaseBTC) ||
        isNaN(increment) || isNaN(decrement) || isNaN(trigger) || isNaN(currentPrice) || currentPrice === 0) {
        console.warn("Advertencia: Uno o más valores de entrada no son números válidos. No se pueden realizar los cálculos.");
        return;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA LONG
    // -------------------------------------------------------------
    let lbalance = amountUSDT;
    let longCoveragePrice = currentPrice;
    let longOrderCount = 0;
    let nextPurchaseAmount = purchaseUSDT;

    while (lbalance >= nextPurchaseAmount && nextPurchaseAmount > 0) {
        lbalance -= nextPurchaseAmount;
        longOrderCount++;

        const orderIndex = longOrderCount;
        const priceDropPercentage = (decrement * orderIndex) / 100;
        longCoveragePrice = longCoveragePrice * (1 - priceDropPercentage);
        
        const nextIncrementAmount = nextPurchaseAmount * (increment / 100);
        nextPurchaseAmount += nextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA SHORT
    // -------------------------------------------------------------
    let sbalance = amountBTC;
    let shortCoveragePrice = currentPrice;
    let shortOrderCount = 0;
    let nextSellAmount = purchaseBTC;

    while (sbalance >= nextSellAmount && nextSellAmount > 0) {
        sbalance -= nextSellAmount;
        shortOrderCount++;

        const orderIndex = shortOrderCount;
        const priceIncreasePercentage = (decrement * orderIndex) / 100;
        shortCoveragePrice = shortCoveragePrice * (1 + priceIncreasePercentage);

        const nextIncrementAmount = nextSellAmount * (increment / 100);
        nextSellAmount += nextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS DE PRECIO OBJETIVO (LTPrice y STPrice)
    // -------------------------------------------------------------
    const ltprice = currentPrice * (1 + trigger / 100);
    const stprice = currentPrice * (1 - trigger / 100);

    // -------------------------------------------------------------
    // ACTUALIZAR LOS DISPLAYS EN EL DOM
    // -------------------------------------------------------------
    lbalanceDisplay.textContent = lbalance.toFixed(2);
    sbalanceDisplay.textContent = sbalance.toFixed(8);

    lcoverageDisplay.textContent = longCoveragePrice.toFixed(2);
    lnorderDisplay.textContent = longOrderCount;

    scoverageDisplay.textContent = shortCoveragePrice.toFixed(2);
    snorderDisplay.textContent = shortOrderCount;

    ltpriceDisplay.textContent = ltprice.toFixed(2);
    stpriceDisplay.textContent = stprice.toFixed(2);
}


// Mantener esta función por compatibilidad, aunque ya no se utilice.
export function actualizarBalancesEstrategia() {
    console.warn("La función actualizarBalancesEstrategia() está obsoleta. Se ha consolidado en actualizarCalculosAutobot().");
}