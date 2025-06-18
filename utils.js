function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    Debug.log(`Iniciando fetch com timeout para: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        Debug.error(`Erro no fetch: ${url}`, { error: error.message });
        if (error.name === 'AbortError') {
            throw new Error('A requisição demorou muito para responder');
        }
        throw error;
    }
}

function showNotification(message, isError = false) {
    Debug.log(`Exibindo notificação: ${message}`, { isError });
    const notificationsDiv = document.getElementById('notifications');
    if (!notificationsDiv) {
        Debug.error('Elemento #notifications não encontrado');
        return;
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${isError ? 'error' : 'success'}`;
    notification.innerHTML = `
        <span>${DOMPurify.sanitize(message)}</span>
        <button class="close-btn" aria-label="Fechar notificação">
            <i class="fas fa-times"></i>
        </button>
    `;
    const closeButton = notification.querySelector('button');
    closeButton.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease-out forwards';
        setTimeout(() => notification.remove(), 300);
    });
    notificationsDiv.appendChild(notification);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

async function logout() {
    Debug.log('Iniciando logout no frontend');
    try {
        const userId = localStorage.getItem('userId');
        if (userId) {
            const res = await fetchWithTimeout('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const text = await res.text();
            Debug.log(`Resposta /api/logout: Status ${res.status}`, { response: text });
            if (!res.ok) {
                let data;
                try {
                    data = JSON.parse(text);
                    throw new Error(data.error || 'Erro ao realizar logout');
                } catch {
                    throw new Error(`Resposta inválida: formato não JSON (${text.slice(0, 100)}...)`);
                }
            }
        }
        localStorage.clear();
        showNotification('Logout realizado com sucesso!');
        setTimeout(() => window.location.href = 'index.html', 1000);
    } catch (error) {
        Debug.error('Erro ao realizar logout', { error: error.message });
        localStorage.clear();
        showNotification('Erro ao realizar logout. Sessão limpa.', true);
        setTimeout(() => window.location.href = 'index.html', 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Debug.log('utils.js carregado');
});
