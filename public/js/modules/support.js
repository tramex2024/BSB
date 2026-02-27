/**
 * support.js - Integrated Ticket System 2026
 */
export function initializeSupport() {
    const btnSupport = document.getElementById('btn-support'); 
    const modalSupport = document.getElementById('support-modal');
    const btnClose = document.getElementById('close-support');
    const btnWhatsApp = document.getElementById('whatsapp-support');

    if (!btnSupport || !modalSupport) return;

    // Abrir Modal Principal
    btnSupport.addEventListener('click', () => {
        modalSupport.style.display = 'flex';
        resetToMainSupport(); // Asegurar que inicie en el menú de opciones
    });

    // Cerrar Modal
    btnClose.addEventListener('click', () => {
        modalSupport.style.display = 'none';
    });

    // Opción WhatsApp
    if (btnWhatsApp) {
        btnWhatsApp.addEventListener('click', () => {
            const phone = "529625198814"; 
            const msg = encodeURIComponent("Hello! I need technical support with BSB platform.");
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
        });
    }

    // Listener para abrir el Formulario de Ticket
    document.addEventListener('click', (e) => {
        if (e.target.closest('#open-ticket-form')) {
            showTicketForm();
        }
    });
}

function showTicketForm() {
    const container = document.getElementById('support-options-container');
    const userEmail = localStorage.getItem('userEmail') || 'not_found@bsb.com';
    const userId = localStorage.getItem('userId') || 'ID_NOT_SET';
    const ticketId = `BSB-${Math.floor(1000 + Math.random() * 9000)}`;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-mono">TICKET: ${ticketId}</span>
                <button id="back-to-support" class="text-xs text-gray-500 hover:text-white transition">
                    <i class="fas fa-arrow-left mr-1"></i> Back
                </button>
            </div>
            
            <form id="internal-ticket-form" class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-800">
                        <label class="text-[9px] text-gray-500 uppercase block">User ID</label>
                        <span class="text-xs font-mono text-gray-300">${userId}</span>
                    </div>
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-800">
                        <label class="text-[9px] text-gray-500 uppercase block">Email</label>
                        <span class="text-xs text-gray-300 truncate block">${userEmail}</span>
                    </div>
                </div>

                <div>
                    <label class="text-[10px] text-gray-400 mb-1 block">Category</label>
                    <select id="ticket-category" required class="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm outline-none focus:border-blue-500 text-gray-200">
                        <option value="Plan">Subscription Plan</option>
                        <option value="Payment">Payment / Billing</option>
                        <option value="Refund">Refund Request</option>
                        <option value="Suggestion">Suggestions</option>
                        <option value="Recognition">Feedback / Recognition</option>
                        <option value="Technical">Technical Issue</option>
                    </select>
                </div>

                <div>
                    <label class="text-[10px] text-gray-400 mb-1 block">Description</label>
                    <textarea id="ticket-message" required placeholder="How can we help you?" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm h-24 outline-none focus:border-blue-500 text-gray-200 resize-none"></textarea>
                </div>

                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center" id="btn-send-ticket">
                    <i class="fas fa-paper-plane mr-2"></i> SEND TICKET
                </button>
            </form>
        </div>
    `;

    // Eventos del formulario
    document.getElementById('back-to-support').onclick = resetToMainSupport;
    document.getElementById('internal-ticket-form').onsubmit = handleTicketSubmit;
}

async function handleTicketSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-send-ticket');
    const originalHTML = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> SENDING...`;

    const payload = {
        userId: localStorage.getItem('userId'),
        email: localStorage.getItem('userEmail'),
        category: document.getElementById('ticket-category').value,
        message: document.getElementById('ticket-message').value
    };

    try {
        // Aquí llamarás a tu endpoint existente de correos
        const response = await fetch('https://bsb-ppex.onrender.com/api/support/ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showSuccessState();
        }
    } catch (err) {
        console.error("Error sending ticket", err);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

function showSuccessState() {
    const container = document.getElementById('support-options-container');
    container.innerHTML = `
        <div class="text-center py-8 animate-bounceIn">
            <div class="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500">
                <i class="fas fa-check text-2xl text-emerald-500"></i>
            </div>
            <h3 class="text-lg font-bold text-white">Ticket Sent!</h3>
            <p class="text-sm text-gray-400 mt-2">We will contact you via email shortly.</p>
            <button onclick="document.getElementById('support-modal').style.display='none'" class="mt-6 text-blue-400 font-bold text-sm uppercase tracking-widest">Close</button>
        </div>
    `;
}

function resetToMainSupport() {
    const container = document.getElementById('support-options-container');
    container.innerHTML = `
        <p class="text-gray-400 text-sm mb-6">Need help with your bots or Bitmart connection? Select an option:</p>
        <div class="grid grid-cols-1 gap-4">
            <button id="whatsapp-support" class="flex items-center justify-between p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl hover:bg-emerald-900/40 transition group">
                <div class="flex items-center">
                    <i class="fab fa-whatsapp text-2xl text-emerald-500 mr-4"></i>
                    <div class="text-left">
                        <span class="block font-bold text-white">Live WhatsApp</span>
                        <span class="text-xs text-gray-400">Immediate assistance</span>
                    </div>
                </div>
                <i class="fas fa-chevron-right text-gray-600 group-hover:text-emerald-500 transition"></i>
            </button>

            <button id="open-ticket-form" class="flex items-center justify-between p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl hover:bg-blue-900/40 transition group text-left">
                <div class="flex items-center">
                    <i class="fas fa-ticket-alt text-2xl text-blue-500 mr-4"></i>
                    <div class="text-left">
                        <span class="block font-bold text-white">Open Support Ticket</span>
                        <span class="text-xs text-gray-400">Response within 24h</span>
                    </div>
                </div>
                <i class="fas fa-chevron-right text-gray-600 group-hover:text-blue-500 transition"></i>
            </button>
        </div>
    `;
}