async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Tempo de requisição excedido');
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

function formatDate(dateString) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(dateString));
}

function showNotification(message, isError = false) {
  const notificationsDiv = document.getElementById('notifications');
  if (!notificationsDiv) return;
  const notification = document.createElement('div');
  notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
  notification.innerHTML = `
    <span>${DOMPurify.sanitize(message)}</span>
    <button onclick="this.parentElement.remove()" class="text-white hover:text-gray-300" aria-label="Fechar notificação">
      <i class="fas fa-times"></i>
    </button>
  `;
  notificationsDiv.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

async function logout() {
  Debug.log('Iniciando logout');
  try {
    const userId = localStorage.getItem('userId');
    const res = await fetchWithTimeout('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const text = await res.text();
    Debug.log(`Resposta /api/logout: Status ${res.status}`, { response: text });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      Debug.warn('Resposta de logout não é JSON', { response: text });
    }
    if (!res.ok) {
      throw new Error(data?.error || `Erro ao fazer logout (Status: ${res.status})`);
    }
    localStorage.clear();
    showNotification('Logout realizado com sucesso!');
    setTimeout(() => window.location.href = 'index.html', 1000);
  } catch (err) {
    Debug.error('Erro ao fazer logout', { error: err.message });
    showNotification(`Erro: ${err.message}`, true);
    localStorage.clear();
    setTimeout(() => window.location.href = 'index.html', 1000);
  }
}
