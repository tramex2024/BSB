/**
 * BSB - Payments & Upgrades Module
 * Handles the payment modal, wallet copying, and TXID submission.
 */

export function initPayments() {
    const btnUpgrade = document.getElementById('btn-upgrade');
    const paymentModal = document.getElementById('payment-modal');
    const closePayment = document.getElementById('close-payment');
    const paymentForm = document.getElementById('payment-form');
    const btnCopyWallet = document.getElementById('btn-copy-wallet');
    const walletInput = document.getElementById('wallet-address-input');

    if (!btnUpgrade || !paymentModal) return;

    // --- 1. ABRIR / CERRAR MODAL ---
    btnUpgrade.onclick = () => paymentModal.style.display = 'flex';
    closePayment.onclick = () => paymentModal.style.display = 'none';

    window.onclick = (event) => {
        if (event.target === paymentModal) paymentModal.style.display = 'none';
    };

    // --- 2. COPIAR BILLETERA ---
    btnCopyWallet.onclick = () => {
        walletInput.select();
        walletInput.setSelectionRange(0, 99999); // Para móviles
        navigator.clipboard.writeText(walletInput.value);

        // Feedback visual en el botón
        const icon = btnCopyWallet.querySelector('i');
        icon.className = 'fas fa-check text-white';
        btnCopyWallet.classList.replace('bg-emerald-600', 'bg-blue-600');
        
        setTimeout(() => {
            icon.className = 'fas fa-copy';
            btnCopyWallet.classList.replace('bg-blue-600', 'bg-emerald-600');
        }, 2000);
    };

    // --- 3. ENVIAR FORMULARIO DE PAGO ---
    paymentForm.onsubmit = async (e) => {
        e.preventDefault();

        const btnSubmit = document.getElementById('btn-submit-payment');
        const originalText = btnSubmit.innerHTML;
        
        // Datos del formulario
        const paymentData = {
            userId: localStorage.getItem('userId') || 'Guest',
            email: localStorage.getItem('userEmail') || 'N/A',
            type: document.getElementById('payment-type').value,
            amount: document.getElementById('payment-amount').value,
            hash: document.getElementById('tx-hash').value.trim(),
            timestamp: new Date().toLocaleString()
        };

        try {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fas fa-circle-notch animate-spin mr-2"></i> Verifying...';

            const response = await fetch('https://bsb-ppex.onrender.com/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });

            const result = await response.json();

            if (result.success) {
                btnSubmit.innerHTML = '<i class="fas fa-check-circle mr-2"></i> SENT SUCCESSFULLY';
                btnSubmit.classList.replace('bg-emerald-600', 'bg-blue-600');
                
                setTimeout(() => {
                    paymentModal.style.display = 'none';
                    paymentForm.reset();
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = originalText;
                    btnSubmit.classList.replace('bg-blue-600', 'bg-emerald-600');
                }, 3000);
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error("❌ Payment Error:", error);
            btnSubmit.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> ERROR SENDING';
            btnSubmit.classList.replace('bg-emerald-600', 'bg-red-600');
            
            setTimeout(() => {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalText;
                btnSubmit.classList.replace('bg-red-600', 'bg-emerald-600');
            }, 3000);
        }
    };
}