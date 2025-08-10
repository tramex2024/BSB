// public/js/modules/aucalculations.js

// Función para actualizar todos los cálculos del Autobot
export function actualizarCalculosAutobot() {
    // Obtener las referencias de todos los inputs y displays del DOM
    const auamountUSDTInput = document.getElementById('auamount-usdt');
    const auamountBTCInput = document.getElementById('auamount-btc');
    const aupurchaseUSDTInput = document.getElementById("aupurchase-usdt");
    const aupurchaseBTCInput = document.getElementById("aupurchase-btc");
    const auincrementInput = document.getElementById("auincrement");
    const audecrementInput = document.getElementById("audecrement");
    const autriggerInput = document.getElementById("autrigger"); // Nuevo input
    const aupriceElement = document.getElementById('auprice');
    
    // Displays para los balances
    const aulbalanceDisplay = document.getElementById('aulbalance');
    const ausbalanceDisplay = document.getElementById('ausbalance');

    // Displays para los cálculos de cobertura
    const aulcoverageDisplay = document.getElementById('aulcoverage');
    const aulnorderDisplay = document.getElementById('aulnorder');
    const auscoverageDisplay = document.getElementById('auscoverage');
    const ausnorderDisplay = document.getElementById('ausnorder');

    // Displays para los nuevos cálculos de precio objetivo
    const aultpriceDisplay = document.getElementById('aultprice');
    const austpriceDisplay = document.getElementById('austprice');

    // Verificar que todos los elementos existan
    if (!auamountUSDTInput || !auamountBTCInput || !aupurchaseUSDTInput || !aupurchaseBTCInput ||
        !auincrementInput || !audecrementInput || !autriggerInput || !aupriceElement || 
        !aulbalanceDisplay || !ausbalanceDisplay || !aulcoverageDisplay || !aulnorderDisplay || 
        !auscoverageDisplay || !ausnorderDisplay || !aultpriceDisplay || !austpriceDisplay) {
        console.warn("Advertencia: No se encontraron todos los elementos necesarios para los cálculos. La función no se ejecutará.");
        return;
    }

    // Convertir valores de los inputs a números
    const auamountUSDT = parseFloat(auamountUSDTInput.value) || 0;
    const auamountBTC = parseFloat(auamountBTCInput.value) || 0;
    const aupurchaseUSDT = parseFloat(aupurchaseUSDTInput.value) || 0;
    const aupurchaseBTC = parseFloat(aupurchaseBTCInput.value) || 0;
    const auincrement = parseFloat(auincrementInput.value) || 0;
    const audecrement = parseFloat(audecrementInput.value) || 0;
    const autrigger = parseFloat(autriggerInput.value) || 0; // Nuevo valor de input
    const aucurrentPrice = parseFloat(aupriceElement.textContent) || 0;

    // Verificar si los valores numéricos son válidos
    if (isNaN(auamountUSDT) || isNaN(auamountBTC) || isNaN(aupurchaseUSDT) || isNaN(aupurchaseBTC) ||
        isNaN(auincrement) || isNaN(audecrement) || isNaN(autrigger) || isNaN(aucurrentPrice) || aucurrentPrice === 0) {
        console.warn("Advertencia: Uno o más valores de entrada no son números válidos. No se pueden realizar los cálculos.");
        return;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA LONG
    // -------------------------------------------------------------
    let aulbalance = auamountUSDT;
    let aulongCoveragePrice = aucurrentPrice;
    let aulongOrderCount = 0;
    let aunextPurchaseAmount = aupurchaseUSDT;

    while (aulbalance >= aunextPurchaseAmount && aunextPurchaseAmount > 0) {
        aulbalance -= aunextPurchaseAmount;
        aulongOrderCount++;

        const auorderIndex = aulongOrderCount;
        const aupriceDropPercentage = (audecrement * auorderIndex) / 100;
        aulongCoveragePrice = aulongCoveragePrice * (1 - aupriceDropPercentage);
        
        const aunextIncrementAmount = aunextPurchaseAmount * (auincrement / 100);
        aunextPurchaseAmount += aunextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA SHORT
    // -------------------------------------------------------------
    let ausbalance = auamountBTC;
    let aushortCoveragePrice = aucurrentPrice;
    let aushortOrderCount = 0;
    let aunextSellAmount = aupurchaseBTC;

    while (ausbalance >= aunextSellAmount && aunextSellAmount > 0) {
        ausbalance -= aunextSellAmount;
        aushortOrderCount++;

        const auorderIndex = aushortOrderCount;
        const aupriceIncreasePercentage = (audecrement * auorderIndex) / 100;
        aushortCoveragePrice = aushortCoveragePrice * (1 + aupriceIncreasePercentage);

        const aunextIncrementAmount = aunextSellAmount * (auincrement / 100);
        aunextSellAmount += aunextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS DE PRECIO OBJETIVO (LTPrice y STPrice)
    // -------------------------------------------------------------
    const aultprice = aucurrentPrice * (1 + autrigger / 100);
    const austprice = aucurrentPrice * (1 - autrigger / 100);

    // -------------------------------------------------------------
    // ACTUALIZAR LOS DISPLAYS EN EL DOM
    // -------------------------------------------------------------
    aulbalanceDisplay.textContent = aulbalance.toFixed(2);
    ausbalanceDisplay.textContent = ausbalance.toFixed(8);

    aulcoverageDisplay.textContent = aulongCoveragePrice.toFixed(2);
    aulnorderDisplay.textContent = aulongOrderCount;

    auscoverageDisplay.textContent = aushortCoveragePrice.toFixed(2);
    ausnorderDisplay.textContent = aushortOrderCount;

    aultpriceDisplay.textContent = aultprice.toFixed(2);
    austpriceDisplay.textContent = austprice.toFixed(2);
}


// Mantener esta función por compatibilidad, aunque ya no se utilice.
export function auactualizarBalancesEstrategia() {
    console.warn("La función auactualizarBalancesEstrategia() está obsoleta. Se ha consolidado en actualizarCalculosAutobot().");
}