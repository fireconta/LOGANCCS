function formatCurrency(value) {
    if (isNaN(value) || value == null) {
        Debug.warn('Valor inválido para formatCurrency', { value });
        return 'R$ 0,00';
    }
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) throw new Error('Data inválida');
        return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch (err) {
        Debug.error('Erro ao formatar data: %s', err.message, { dateString });
        return 'Data inválida';
    }
}

function showNotification(message, isError = false) {
    const notifications = document.getElementById('notifications');
    if (!notifications) {
        Debug.error('Elemento de notificações não encontrado');
        return;
    }
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.setAttribute('role', 'alert');
    notification.innerHTML = `
        ${DOMPurify.sanitize(message)}
        <button class="text-white hover:text-gray-300" aria-label="Fechar notificação">
            <i class="fas fa-times"></i>
        </button>
    `;
    notifications.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    notification.querySelector('button').addEventListener('click', () => {
        notification.remove();
        Debug.log('Notificação fechada pelo usuário');
    });
    Debug.log(`Notificação exibida: ${message}`, { isError });
}

function showDebugNotification(message, isError = false) {
    showNotification(message, isError);
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            Debug.error('Fetch timeout após %dms', timeout, { url });
            throw new Error('Tempo de requisição esgotado');
        }
        Debug.error('Erro no fetch: %s', err.message, { url, options });
        throw err;
    }
}
