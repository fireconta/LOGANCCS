const TIMEOUT = 15000;

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        return response;
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw err;
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

function showNotification(message, isError = false) {
    const notifications = document.getElementById('notifications');
    if (!notifications) return;
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.innerHTML = `<span>${DOMPurify.sanitize(message)}</span><button onclick="this.parentElement.remove()" class="ml-2 text-white" aria-label="Fechar">✕</button>`;
    notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showDebugNotification(message, isError = false) {
    const notifications = document.getElementById('notifications');
    if (!notifications) return;
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.innerHTML = `<span>${DOMPurify.sanitize(message)}</span><button onclick="this.parentElement.remove()" class="ml-2 text-white" aria-label="Fechar">✕</button>`;
    notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 7000);
}

function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    window.location.href = '/index.html';
}

function restrictInput(input) {
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '');
}
