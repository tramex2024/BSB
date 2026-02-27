/**
 * support.js - Integrated Ticket System (Direct Server Email)
 */
export function initializeSupport() {
    const btnSupport = document.getElementById('btn-support'); 
    const modalSupport = document.getElementById('support-modal');
    const btnClose = document.getElementById('close-support');

    if (!btnSupport || !modalSupport) return;

    // Abrir Modal Principal
    btnSupport.addEventListener('click', () => {
        modalSupport.style.display = 'flex';
        resetToMainSupport(); 
    });

    // Cerrar Modal
    btnClose.addEventListener('click', () => {
        modalSupport.style.display = 'none';
    });

    // Delegación de eventos para botones dinámicos
    document.addEventListener('click', (e) => {
        // Abrir Formulario de Ticket
        if (e.target.closest('#open-ticket-form')) {
            showTicketForm();
        }
        // Botón Volver
        if (e.target.closest('#back-to-support')) {
            resetToMainSupport();
        }
        // WhatsApp
        if (e.target.closest('#whatsapp-support')) {
            const phone = "529625198814"; 
            const msg = encodeURIComponent("Hello BSB Support! I need assistance.");
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
        }
    });
}

function showTicketForm() {
    const container = document.getElementById('support-options-container');
    const userEmail = localStorage.getItem('userEmail') || 'Not Set';
    const userId = localStorage.getItem('userId') || 'Guest';
    const ticketId = `BSB-${Math.floor(1000 + Math.random() * 9000)}`;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-mono font-bold tracking-wider">TICKET ID: ${ticketId}</span>
                <button id="back-to-support" class="text-xs text-gray-500 hover:text-white transition">
                    <i class="fas fa-arrow-left mr-1"></i> Back
                </button>
            </div>
            
            <form id="internal-ticket-form" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-800">
                        <label class="text-[9px] text-gray-500 uppercase block font-bold">Your Email</label>
                        <span class="text-xs text-gray-300 truncate block">${userEmail}</span>
                    </div>
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-800">
                        <label class="text-[9px] text-gray-500 uppercase block font-bold">User ID</label>
                        <span class="text-xs font-mono text-gray-300">${userId}</span>
                    </div>
                </div>

                <div>
                    <label class="text-[10px] text-gray-400 mb-1 block font-bold">Problem Category</label>
                    <select id="ticket-category" required class="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 text-gray-200 cursor-pointer">
                        <option value="Plan">Subscription Plan / Advanced Role</option>
                        <option value="Payment">Payment / Billing Issue</option>
                        <option value="Refund">Refund Request</option>
                        <option value="Suggestion">Product Suggestion</option>
                        <option value="Recognition">Recognition / Feedback</option>
                        <option value="Technical">Technical Error / Bug</option>
                    </select>
                </div>

                <div>
                    <label class="text-[10px] text-gray-400 mb-1 block font-bold">Message / Description</label>
                    <textarea id="ticket-message" required placeholder="Tell us more about your issue..." class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm h-32 outline-none focus:border-blue-500 text-gray-200 resize-none"></textarea>
                </div>

                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center shadow-lg" id="btn-send-ticket">
                    <i class="fas fa-paper-plane mr-2"></i> SUBMIT TICKET
                </button>
            </form>
        </div>
    `;

    document.getElementById('internal-ticket-form').onsubmit = handleTicketSubmit;
}

async function handleTicketSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-send-ticket');
    const originalHTML = btn.innerHTML;
    
    // Bloquear botón para evitar doble envío
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> SENDING TICKET...`;

    const payload = {
        userId: localStorage.getItem('userId'),
        email: localStorage.getItem('userEmail'),
        category: document.getElementById('ticket-category').value,
        message: document.getElementById('ticket-message').value,
        timestamp: new Date().toISOString()
    };

    try {
        // IMPORTANTE: Asegúrate de que este endpoint coincida con tu backend
        const response = await fetch('https://bsb-ppex.onrender.com/api/support/ticket', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showSuccessState();
        } else {
            throw new Error(result.message || "Failed to send");
        }
    } catch (err) {
        console.error("❌ Error sending ticket:", err);
        alert("Could not send ticket. Please try WhatsApp support.");
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

function showSuccessState() {
    const container = document.getElementById('support-options-container');
    container.innerHTML = `
        <div class="text-center py-10 animate-fadeIn">
            <div class="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <i class="fas fa-check text-3xl text-emerald-500"></i>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">Ticket Submitted!</h3>
            <p class="text-sm text-gray-400 max-w-[250px] mx-auto">Your request has been sent to our team. We will reply to your email shortly.</p>
            <button onclick="document.getElementById('support-modal').style.display='none'" class="mt-8 bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg text-sm font-bold transition uppercase tracking-widest">Close</button>
        </div>
    `;
}

function resetToMainSupport() {
    const container = document.getElementById('support-options-container');
    container.innerHTML = `
        <p class="text-gray-400 text-sm mb-6">Need help with your bots or Bitmart connection? Select an option:</p>
        <div class="grid grid-cols-1 gap-4">
            <button id="whatsapp-support" class="flex items-center justify-between p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl hover:bg-emerald-900/40 transition group text-left">
                <div class="flex items-center">
                    <i class="fab fa-whatsapp text-2xl text-emerald-500 mr-4"></i>
                    <div>
                        <span class="block font-bold text-white">Live WhatsApp</span>
                        <span class="text-xs text-gray-400">Immediate assistance</span>
                    </div>
                </div>
                <i class="fas fa-chevron-right text-gray-600 group-hover:text-emerald-500 transition"></i>
            </button>

            <button id="open-ticket-form" class="flex items-center justify-between p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl hover:bg-blue-900/40 transition group text-left">
                <div class="flex items-center">
                    <i class="fas fa-ticket-alt text-2xl text-blue-500 mr-4"></i>
                    <div>
                        <span class="block font-bold text-white">Open Support Ticket</span>
                        <span class="text-xs text-gray-400">Integrated email support</span>
                    </div>
                </div>
                <i class="fas fa-chevron-right text-gray-600 group-hover:text-blue-500 transition"></i>
            </button>
        </div>
    `;
}