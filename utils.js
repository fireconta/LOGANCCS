const isDevMode = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

async function fetchWithTimeout(url, options, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const startTime = performance.now();
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const endTime = performance.now();
        clearTimeout(id);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }
        if (isDevMode) {
            Debug.info(`[API] ${url} - Sucesso | Tempo: ${(endTime - startTime).toFixed(2)}ms | Status: ${response.status}`);
        }
        return response;
    } catch (error) {
        const endTime = performance.now();
        clearTimeout(id);
        if (isDevMode) {
            Debug.error(`[API] ${url} - Falha | Tempo: ${(endTime - startTime).toFixed(2)}ms | Erro: ${error.message}`);
        }
        if (error.name === 'AbortError') {
            throw new Error('Tempo de resposta do servidor excedido. Tente novamente.');
        }
        throw error;
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function showNotification(message, isError = false) {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.innerHTML = `
        ${DOMPurify.sanitize(message)}
        <button class="text-white hover:text-gray-200" onclick="this.parentElement.remove()" aria-label="Fechar notificação">
            <i class="fas fa-times"></i>
        </button>
    `;
    notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
