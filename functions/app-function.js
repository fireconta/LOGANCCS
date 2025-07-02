let allCards = [];
let allPrices = [];
let allUsers = [];
let allBanks = [];
let debounceTimeout;
const isDevMode = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

function debounce(func, wait) {
    return function (...args) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function formatCardNumber(numero) {
    return numero.replace(/(\d{4})(\d{2})(\d{6})(\d{4})/, '$1 $2** **** ****');
}

function maskCvv(cvv) {
    return '*'.repeat(cvv.length);
}

function maskExpiry(dataValidade) {
    return '**/**';
}

function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

function getBrandIcon(bandeira) {
    const brandIcons = {
        'visa': 'fa-cc-visa',
        'mastercard': 'fa-cc-mastercard',
        'amex': 'fa-cc-amex',
        'elo': 'fa-credit-card',
        'maestro': 'fa-credit-card',
        'discover': 'fa-cc-discover'
    };
    const key = bandeira.toLowerCase();
    return `<i class="fas ${brandIcons[key] || 'fa-credit-card'} brand-icon"></i>`;
}

function getBankIcon() {
    return `<i class="fas fa-university bank-icon"></i>`;
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.innerHTML = `
        <span>${DOMPurify.sanitize(message)}</span>
        <button onclick="this.parentElement.remove()" class="text-white hover:text-gray-200" aria-label="Fechar notificação">
            <i class="fas fa-times"></i>
        </button>
    `;
    document.getElementById('notifications').appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

async function fetchWithTimeout(url, options, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Tempo de resposta do servidor excedido. Tente novamente.');
        }
        throw error;
    } finally {
        if (isDevMode) console.log(`Fetch ${url}: ${error ? `Erro - ${error.message}` : 'Sucesso'}`);
    }
}

async function checkEnvironment() {
    try {
        const response = await fetchWithTimeout('/api/check-env', {}, 10000);
        const data = await response.json();
        if (!data.mongodbConnected) {
            showNotification('Falha na conexão com o banco de dados. Tente novamente mais tarde.', true);
            return false;
        }
        if (!data.collections?.cards?.exists || !data.collections?.cardPrices?.exists || 
            !data.collections?.users?.exists || !data.collections?.banks?.exists) {
            showNotification('Dados indisponíveis. Contate o administrador.', true);
            return false;
        }
        if (isDevMode) console.log('Ambiente verificado com sucesso:', data);
        return true;
    } catch (err) {
        showNotification(`Erro ao verificar servidor: ${err.message}. Tente novamente.`, true);
        if (isDevMode) console.error('Erro em checkEnvironment:', err);
        return false;
    }
}

async function checkAuth(attempt = 1, maxAttempts = 2) {
    const userId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');
    if (!userId) {
        showNotification('Usuário não autenticado. Redirecionando para login...', true);
        setTimeout(() => { window.location.href = '/index.html'; }, 1000);
        return false;
    }
    try {
        const response = await fetchWithTimeout(`/api/user?userId=${encodeURIComponent(userId)}`, {}, 10000);
        const data = await response.json();
        if (!data || !data.username || typeof data.isAdmin !== 'boolean') {
            throw new Error('Resposta da API de autenticação inválida');
        }
        if (!data.isAdmin) {
            showNotification('Acesso não autorizado. Redirecionando...', true);
            setTimeout(() => { window.location.href = '/index.html'; }, 1000);
            return false;
        }
        document.getElementById('usernameDisplay').innerHTML = `<i class="fas fa-user mr-2"></i> ${DOMPurify.sanitize(data.username || storedUsername || 'Usuário')}`;
        if (isDevMode) console.log('Autenticação bem-sucedida:', data);
        return true;
    } catch (err) {
        if (isDevMode) console.error(`Tentativa ${attempt} de autenticação falhou:`, err);
        if (attempt < maxAttempts) {
            showNotification('Tentando reconectar...', false);
            return await checkAuth(attempt + 1, maxAttempts);
        }
        showNotification(`Erro de conexão: ${err.message}. Redirecionando...`, true);
        setTimeout(() => { window.location.href = '/index.html'; }, 1000);
        return false;
    }
}

async function loadCards() {
    const cardsGrid = document.getElementById('cardsGrid');
    cardsGrid.innerHTML = '<p class="text-gray-500 text-center"><i class="fas fa-spinner animate-spin mr-2"></i> Carregando...</p>';
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const userId = localStorage.getItem('userId');
        const response = await fetchWithTimeout(`/api/get-cards?userId=${encodeURIComponent(userId)}`, {}, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        if (!Array.isArray(data)) {
            throw new Error('Resposta de cartões não é um array');
        }
        allCards = data;
        if (allCards.length === 0) {
            cardsGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum cartão disponível no momento.</p>';
            showNotification('Nenhum cartão disponível.', true);
            return;
        }
        populateCardFilters();
        applyCardFilters();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        cardsGrid.innerHTML = `<p class="no-results"><i class="fas fa-exclamation-circle mr-2"></i> Erro ao carregar cartões: ${DOMPurify.sanitize(err.message)}.</p>`;
        showNotification(`Erro ao carregar cartões: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em loadCards:', err);
    }
}

async function loadPrices() {
    const pricesGrid = document.getElementById('pricesGrid');
    pricesGrid.innerHTML = '<p class="text-gray-500 text-center"><i class="fas fa-spinner animate-spin mr-2"></i> Carregando...</p>';
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const userId = localStorage.getItem('userId');
        const response = await fetchWithTimeout(`/api/get-card-prices?userId=${encodeURIComponent(userId)}`, {}, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        if (!Array.isArray(data)) {
            throw new Error('Resposta de preços não é um array');
        }
        allPrices = data;
        if (allPrices.length === 0) {
            pricesGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum preço disponível no momento.</p>';
            showNotification('Nenhum preço disponível.', true);
            return;
        }
        applyPriceFilters();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        pricesGrid.innerHTML = `<p class="no-results"><i class="fas fa-exclamation-circle mr-2"></i> Erro ao carregar preços: ${DOMPurify.sanitize(err.message)}.</p>`;
        showNotification(`Erro ao carregar preços: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em loadPrices:', err);
    }
}

async function loadUsers() {
    const usersGrid = document.getElementById('usersGrid');
    usersGrid.innerHTML = '<p class="text-gray-500 text-center"><i class="fas fa-spinner animate-spin mr-2"></i> Carregando...</p>';
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const userId = localStorage.getItem('userId');
        const response = await fetchWithTimeout(`/api/get-users?userId=${encodeURIComponent(userId)}`, {}, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        if (!Array.isArray(data)) {
            throw new Error('Resposta de usuários não é um array');
        }
        allUsers = data;
        if (allUsers.length === 0) {
            usersGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum usuário disponível no momento.</p>';
            showNotification('Nenhum usuário disponível.', true);
            return;
        }
        applyUserFilters();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        usersGrid.innerHTML = `<p class="no-results"><i class="fas fa-exclamation-circle mr-2"></i> Erro ao carregar usuários: ${DOMPurify.sanitize(err.message)}.</p>`;
        showNotification(`Erro ao carregar usuários: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em loadUsers:', err);
    }
}

async function loadBanks() {
    const banksGrid = document.getElementById('banksGrid');
    banksGrid.innerHTML = '<p class="text-gray-500 text-center"><i class="fas fa-spinner animate-spin mr-2"></i> Carregando...</p>';
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const userId = localStorage.getItem('userId');
        const response = await fetchWithTimeout(`/api/get-banks?userId=${encodeURIComponent(userId)}`, {}, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        if (!Array.isArray(data)) {
            throw new Error('Resposta de bancos não é um array');
        }
        allBanks = data;
        if (allBanks.length === 0) {
            banksGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum banco disponível no momento.</p>';
            showNotification('Nenhum banco disponível.', true);
            return;
        }
        applyBankFilters();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        banksGrid.innerHTML = `<p class="no-results"><i class="fas fa-exclamation-circle mr-2"></i> Erro ao carregar bancos: ${DOMPurify.sanitize(err.message)}.</p>`;
        showNotification(`Erro ao carregar bancos: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em loadBanks:', err);
    }
}

async function loadModalOptions() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const userId = localStorage.getItem('userId');
        const [pricesResponse, cardsResponse, banksResponse] = await Promise.all([
            fetchWithTimeout(`/api/get-card-prices?userId=${encodeURIComponent(userId)}`, {}, 10000),
            fetchWithTimeout(`/api/get-cards?userId=${encodeURIComponent(userId)}`, {}, 10000),
            fetchWithTimeout(`/api/get-banks?userId=${encodeURIComponent(userId)}`, {}, 10000)
        ]);
        const pricesData = await pricesResponse.json();
        const cardsData = await cardsResponse.json();
        const banksData = await banksResponse.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        if (!Array.isArray(pricesData) || !Array.isArray(cardsData) || !Array.isArray(banksData)) {
            throw new Error('Resposta das opções não é um array');
        }
        const levels = [...new Set(pricesData.map(p => p.nivel))].sort();
        const brands = [...new Set(cardsData.map(c => c.bandeira))].sort();
        const banks = [...new Set(banksData.map(b => b.name))].sort();

        const levelSelects = [document.getElementById('cardNivel'), document.getElementById('editCardNivel')];
        const brandSelects = [document.getElementById('cardBandeira'), document.getElementById('editCardBandeira')];
        const bankSelects = [document.getElementById('cardBanco'), document.getElementById('editCardBanco')];

        levelSelects.forEach(select => {
            select.innerHTML = '<option value="">Selecione o Nível</option>' +
                levels.map(level => `<option value="${DOMPurify.sanitize(level)}">${DOMPurify.sanitize(level)}</option>`).join('');
        });
        brandSelects.forEach(select => {
            select.innerHTML = '<option value="">Selecione a Bandeira</option>' +
                brands.map(brand => `<option value="${DOMPurify.sanitize(brand)}">${DOMPurify.sanitize(brand)}</option>`).join('');
        });
        bankSelects.forEach(select => {
            select.innerHTML = '<option value="">Selecione o Banco</option>' +
                banks.map(bank => `<option value="${DOMPurify.sanitize(bank)}">${DOMPurify.sanitize(bank)}</option>`).join('');
        });
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro ao carregar opções: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em loadModalOptions:', err);
    }
}

function populateCardFilters() {
    const levelFilter = document.getElementById('cardLevelFilter');
    const brandFilter = document.getElementById('cardBrandFilter');
    const bankFilter = document.getElementById('cardBankFilter');
    const levels = [...new Set(allCards.map(card => card.nivel))].sort();
    const brands = [...new Set(allCards.map(card => card.bandeira))].sort();
    const banks = [...new Set(allCards.map(card => card.banco))].sort();

    levelFilter.innerHTML = '<option value="">Todos os Níveis</option>' +
        levels.map(level => `<option value="${DOMPurify.sanitize(level)}">${DOMPurify.sanitize(level)}</option>`).join('');
    brandFilter.innerHTML = '<option value="">Todas as Bandeiras</option>' +
        brands.map(brand => `<option value="${DOMPurify.sanitize(brand)}">${DOMPurify.sanitize(brand)}</option>`).join('');
    bankFilter.innerHTML = '<option value="">Todos os Bancos</option>' +
        banks.map(bank => `<option value="${DOMPurify.sanitize(bank)}">${DOMPurify.sanitize(bank)}</option>`).join('');

    const savedFilters = JSON.parse(localStorage.getItem('cardFilters') || '{}');
    if (savedFilters.level) levelFilter.value = savedFilters.level;
    if (savedFilters.brand) brandFilter.value = savedFilters.brand;
    if (savedFilters.bank) bankFilter.value = savedFilters.bank;
    if (savedFilters.search) document.getElementById('cardSearch').value = savedFilters.search;
}

function applyCardFilters() {
    const searchQuery = document.getElementById('cardSearch').value.trim().toLowerCase();
    const levelFilter = document.getElementById('cardLevelFilter').value;
    const brandFilter = document.getElementById('cardBrandFilter').value;
    const bankFilter = document.getElementById('cardBankFilter').value;

    const filters = { search: searchQuery, level: levelFilter, brand: brandFilter, bank: bankFilter };
    localStorage.setItem('cardFilters', JSON.stringify(filters));

    const filteredCards = allCards.filter(card => {
        const matchesSearch = !searchQuery ||
            card.nivel.toLowerCase().includes(searchQuery) ||
            card.numero.includes(searchQuery) ||
            card.bandeira.toLowerCase().includes(searchQuery) ||
            card.banco.toLowerCase().includes(searchQuery);
        const matchesLevel = !levelFilter || card.nivel === levelFilter;
        const matchesBrand = !brandFilter || card.bandeira === brandFilter;
        const matchesBank = !bankFilter || card.banco === bankFilter;
        return matchesSearch && matchesLevel && matchesBrand && matchesBank;
    });

    renderCards(filteredCards);
}

const debounceFilterCards = debounce((query) => {
    document.getElementById('cardSearch').value = query;
    applyCardFilters();
}, 300);

function clearCardFilters() {
    document.getElementById('cardSearch').value = '';
    document.getElementById('cardLevelFilter').value = '';
    document.getElementById('cardBrandFilter').value = '';
    document.getElementById('cardBankFilter').value = '';
    localStorage.removeItem('cardFilters');
    applyCardFilters();
    document.getElementById('cardSearch').focus();
}

function applyPriceFilters() {
    const searchQuery = document.getElementById('priceSearch').value.trim().toLowerCase();
    const filteredPrices = allPrices.filter(price => {
        return !searchQuery || price.nivel.toLowerCase().includes(searchQuery);
    });
    renderPrices(filteredPrices);
}

const debounceFilterPrices = debounce((query) => {
    document.getElementById('priceSearch').value = query;
    applyPriceFilters();
}, 300);

function clearPriceFilters() {
    document.getElementById('priceSearch').value = '';
    applyPriceFilters();
    document.getElementById('priceSearch').focus();
}

function applyUserFilters() {
    const searchQuery = document.getElementById('userSearch').value.trim().toLowerCase();
    const filteredUsers = allUsers.filter(user => {
        return !searchQuery || user.username.toLowerCase().includes(searchQuery);
    });
    renderUsers(filteredUsers);
}

const debounceFilterUsers = debounce((query) => {
    document.getElementById('userSearch').value = query;
    applyUserFilters();
}, 300);

function clearUserFilters() {
    document.getElementById('userSearch').value = '';
    applyUserFilters();
    document.getElementById('userSearch').focus();
}

function applyBankFilters() {
    const searchQuery = document.getElementById('bankSearch').value.trim().toLowerCase();
    const filteredBanks = allBanks.filter(bank => {
        return !searchQuery || bank.name.toLowerCase().includes(searchQuery);
    });
    renderBanks(filteredBanks);
}

const debounceFilterBanks = debounce((query) => {
    document.getElementById('bankSearch').value = query;
    applyBankFilters();
}, 300);

function clearBankFilters() {
    document.getElementById('bankSearch').value = '';
    applyBankFilters();
    document.getElementById('bankSearch').focus();
}

function renderCards(cards) {
    const cardsGrid = document.getElementById('cardsGrid');
    cardsGrid.innerHTML = '';
    if (cards.length === 0) {
        cardsGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum cartão encontrado.</p>';
        return;
    }
    cards.forEach(card => {
        if (!card.nivel || !card.numero || !card.dataValidade || !card.cvv || !card.bin || !card.bandeira || !card.banco) {
            return;
        }
        const cardDiv = document.createElement('div');
        cardDiv.className = `card-item`;
        cardDiv.setAttribute('role', 'article');
        cardDiv.setAttribute('aria-label', `Cartão ${card.nivel}`);
        cardDiv.innerHTML = `
            <div class="card-content">
                <div class="card-header">
                    <p class="card-brand">${getBrandIcon(card.bandeira)} ${DOMPurify.sanitize(card.bandeira)}</p>
                    <p class="card-bank">${getBankIcon()} ${DOMPurify.sanitize(card.banco)}</p>
                </div>
                <p class="text-lg font-semibold mt-1">${DOMPurify.sanitize(card.nivel)}</p>
                <p class="card-number">${formatCardNumber(DOMPurify.sanitize(card.numero))}</p>
                <div class="card-details">
                    <div>
                        <p><i class="fas fa-calendar-alt mr-1"></i> Validade: ${maskExpiry(DOMPurify.sanitize(card.dataValidade))}</p>
                        <p><i class="fas fa-lock mr-1"></i> CVV: ${maskCvv(DOMPurify.sanitize(card.cvv))}</p>
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-2">
                    <button class="action-button edit-button text-white" onclick="openEditCardModal('${card._id}')" aria-label="Editar cartão ${card.nivel}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="action-button delete-button text-white" onclick="deleteCard('${card._id}')" aria-label="Excluir cartão ${card.nivel}">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
        cardsGrid.appendChild(cardDiv);
    });
}

function renderPrices(prices) {
    const pricesGrid = document.getElementById('pricesGrid');
    pricesGrid.innerHTML = '';
    if (prices.length === 0) {
        pricesGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum preço encontrado.</p>';
        return;
    }
    prices.forEach(price => {
        if (!price.nivel || !price.price) {
            return;
        }
        const priceDiv = document.createElement('div');
        priceDiv.className = `price-item`;
        priceDiv.setAttribute('role', 'article');
        priceDiv.setAttribute('aria-label', `Preço ${price.nivel}`);
        priceDiv.innerHTML = `
            <p class="text-lg font-semibold">${DOMPurify.sanitize(price.nivel)}</p>
            <p><i class="fas fa-dollar-sign mr-1"></i> Preço: ${formatCurrency(price.price)}</p>
            <div class="flex justify-end gap-2 mt-2">
                <button class="action-button edit-button text-white" onclick="openEditPriceModal('${price._id}')" aria-label="Editar preço ${price.nivel}">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="action-button delete-button text-white" onclick="deletePrice('${price._id}')" aria-label="Excluir preço ${price.nivel}">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        pricesGrid.appendChild(priceDiv);
    });
}

function renderUsers(users) {
    const usersGrid = document.getElementById('usersGrid');
    usersGrid.innerHTML = '';
    if (users.length === 0) {
        usersGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum usuário encontrado.</p>';
        return;
    }
    users.forEach(user => {
        if (!user.username || user.balance === undefined) {
            return;
        }
        const userDiv = document.createElement('div');
        userDiv.className = `user-item`;
        userDiv.setAttribute('role', 'article');
        userDiv.setAttribute('aria-label', `Usuário ${user.username}`);
        userDiv.innerHTML = `
            <p class="text-lg font-semibold">${DOMPurify.sanitize(user.username)}</p>
            <p><i class="fas fa-wallet mr-1"></i> Saldo: ${formatCurrency(user.balance)}</p>
            <p><i class="fas fa-user-shield mr-1"></i> Tipo: ${user.isAdmin ? 'Administrador' : 'Usuário Comum'}</p>
            <div class="flex justify-end gap-2 mt-2">
                <button class="action-button edit-button text-white" onclick="openEditUserModal('${user._id}')" aria-label="Editar usuário ${user.username}">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="action-button delete-button text-white" onclick="deleteUser('${user._id}')" aria-label="Excluir usuário ${user.username}">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        usersGrid.appendChild(userDiv);
    });
}

function renderBanks(banks) {
    const banksGrid = document.getElementById('banksGrid');
    banksGrid.innerHTML = '';
    if (banks.length === 0) {
        banksGrid.innerHTML = '<p class="no-results"><i class="fas fa-exclamation-triangle mr-2"></i> Nenhum banco encontrado.</p>';
        return;
    }
    banks.forEach(bank => {
        if (!bank.name) {
            return;
        }
        const bankDiv = document.createElement('div');
        bankDiv.className = `bank-item`;
        bankDiv.setAttribute('role', 'article');
        bankDiv.setAttribute('aria-label', `Banco ${bank.name}`);
        bankDiv.innerHTML = `
            <p class="text-lg font-semibold">${getBankIcon()} ${DOMPurify.sanitize(bank.name)}</p>
            <div class="flex justify-end gap-2 mt-2">
                <button class="action-button edit-button text-white" onclick="openEditBankModal('${bank._id}')" aria-label="Editar banco ${bank.name}">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="action-button delete-button text-white" onclick="deleteBank('${bank._id}')" aria-label="Excluir banco ${bank.name}">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        banksGrid.appendChild(bankDiv);
    });
}

async function openAddCardModal() {
    await loadModalOptions();
    document.getElementById('addCardModal').style.display = 'flex';
    document.getElementById('cardNivel').focus();
}

function closeAddCardModal() {
    document.getElementById('addCardModal').style.display = 'none';
    document.getElementById('cardNivel').value = '';
    document.getElementById('cardNumero').value = '';
    document.getElementById('cardDataValidade').value = '';
    document.getElementById('cardCvv').value = '';
    document.getElementById('cardBin').value = '';
    document.getElementById('cardBandeira').value = '';
    document.getElementById('cardBanco').value = '';
}

async function openEditCardModal(id) {
    const card = allCards.find(c => c._id === id);
    if (!card) return;
    await loadModalOptions();
    document.getElementById('editCardId').value = id;
    document.getElementById('editCardNivel').value = card.nivel;
    document.getElementById('editCardNumero').value = card.numero;
    document.getElementById('editCardDataValidade').value = card.dataValidade;
    document.getElementById('editCardCvv').value = card.cvv;
    document.getElementById('editCardBin').value = card.bin;
    document.getElementById('editCardBandeira').value = card.bandeira;
    document.getElementById('editCardBanco').value = card.banco;
    document.getElementById('editCardModal').style.display = 'flex';
    document.getElementById('editCardNivel').focus();
}

function closeEditCardModal() {
    document.getElementById('editCardModal').style.display = 'none';
    document.getElementById('editCardId').value = '';
    document.getElementById('editCardNivel').value = '';
    document.getElementById('editCardNumero').value = '';
    document.getElementById('editCardDataValidade').value = '';
    document.getElementById('editCardCvv').value = '';
    document.getElementById('editCardBin').value = '';
    document.getElementById('editCardBandeira').value = '';
    document.getElementById('editCardBanco').value = '';
}

function openAddPriceModal() {
    document.getElementById('addPriceModal').style.display = 'flex';
    document.getElementById('priceNivel').focus();
}

function closeAddPriceModal() {
    document.getElementById('addPriceModal').style.display = 'none';
    document.getElementById('priceNivel').value = '';
    document.getElementById('priceValor').value = '';
}

function openEditPriceModal(id) {
    const price = allPrices.find(p => p._id === id);
    if (!price) return;
    document.getElementById('editPriceId').value = id;
    document.getElementById('editPriceNivel').value = price.nivel;
    document.getElementById('editPriceValor').value = price.price;
    document.getElementById('editPriceModal').style.display = 'flex';
    document.getElementById('editPriceNivel').focus();
}

function closeEditPriceModal() {
    document.getElementById('editPriceModal').style.display = 'none';
    document.getElementById('editPriceId').value = '';
    document.getElementById('editPriceNivel').value = '';
    document.getElementById('editPriceValor').value = '';
}

function openAddUserModal() {
    document.getElementById('addUserModal').style.display = 'flex';
    document.getElementById('userUsername').focus();
}

function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userBalance').value = '';
    document.getElementById('userIsAdmin').value = 'false';
}

function openEditUserModal(id) {
    const user = allUsers.find(u => u._id === id);
    if (!user) return;
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserUsername').value = user.username;
    document.getElementById('editUserBalance').value = user.balance;
    document.getElementById('editUserIsAdmin').value = user.isAdmin.toString();
    document.getElementById('editUserModal').style.display = 'flex';
    document.getElementById('editUserUsername').focus();
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    document.getElementById('editUserId').value = '';
    document.getElementById('editUserUsername').value = '';
    document.getElementById('editUserBalance').value = '';
    document.getElementById('editUserIsAdmin').value = 'false';
}

function openAddBankModal() {
    document.getElementById('addBankModal').style.display = 'flex';
    document.getElementById('bankName').focus();
}

function closeAddBankModal() {
    document.getElementById('addBankModal').style.display = 'none';
    document.getElementById('bankName').value = '';
}

function openEditBankModal(id) {
    const bank = allBanks.find(b => b._id === id);
    if (!bank) return;
    document.getElementById('editBankId').value = id;
    document.getElementById('editBankName').value = bank.name;
    document.getElementById('editBankModal').style.display = 'flex';
    document.getElementById('editBankName').focus();
}

function closeEditBankModal() {
    document.getElementById('editBankModal').style.display = 'none';
    document.getElementById('editBankId').value = '';
    document.getElementById('editBankName').value = '';
}

async function addCard() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const card = {
            nivel: document.getElementById('cardNivel').value,
            numero: document.getElementById('cardNumero').value.trim(),
            dataValidade: document.getElementById('cardDataValidade').value.trim(),
            cvv: document.getElementById('cardCvv').value.trim(),
            bin: document.getElementById('cardBin').value.trim(),
            bandeira: document.getElementById('cardBandeira').value,
            banco: document.getElementById('cardBanco').value
        };
        if (!card.nivel || !card.numero || !card.dataValidade || !card.cvv || !card.bin || !card.bandeira || !card.banco) {
            showNotification('Preencha todos os campos do cartão.', true);
            return;
        }
        if (!/^\d{16}$/.test(card.numero)) {
            showNotification('Número do cartão deve ter 16 dígitos.', true);
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(card.dataValidade)) {
            showNotification('Data de validade deve estar no formato MM/AA.', true);
            return;
        }
        if (!/^\d{3,4}$/.test(card.cvv)) {
            showNotification('CVV deve ter 3 ou 4 dígitos.', true);
            return;
        }
        if (!/^\d{6}$/.test(card.bin)) {
            showNotification('BIN deve ter 6 dígitos.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/add-card?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Cartão adicionado com sucesso!', false);
        closeAddCardModal();
        await loadCards();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em addCard:', err);
    }
}

async function updateCard() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const card = {
            _id: document.getElementById('editCardId').value,
            nivel: document.getElementById('editCardNivel').value,
            numero: document.getElementById('editCardNumero').value.trim(),
            dataValidade: document.getElementById('editCardDataValidade').value.trim(),
            cvv: document.getElementById('editCardCvv').value.trim(),
            bin: document.getElementById('editCardBin').value.trim(),
            bandeira: document.getElementById('editCardBandeira').value,
            banco: document.getElementById('editCardBanco').value
        };
        if (!card.nivel || !card.numero || !card.dataValidade || !card.cvv || !card.bin || !card.bandeira || !card.banco) {
            showNotification('Preencha todos os campos do cartão.', true);
            return;
        }
        if (!/^\d{16}$/.test(card.numero)) {
            showNotification('Número do cartão deve ter 16 dígitos.', true);
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(card.dataValidade)) {
            showNotification('Data de validade deve estar no formato MM/AA.', true);
            return;
        }
        if (!/^\d{3,4}$/.test(card.cvv)) {
            showNotification('CVV deve ter 3 ou 4 dígitos.', true);
            return;
        }
        if (!/^\d{6}$/.test(card.bin)) {
            showNotification('BIN deve ter 6 dígitos.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/update-card?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Cartão atualizado com sucesso!', false);
        closeEditCardModal();
        await loadCards();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em updateCard:', err);
    }
}

async function deleteCard(id) {
    if (!confirm('Tem certeza que deseja excluir este cartão?')) return;
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const response = await fetchWithTimeout(`/api/delete-card?userId=${encodeURIComponent(localStorage.getItem('userId'))}&id=${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Cartão excluído com sucesso!', false);
        await loadCards();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em deleteCard:', err);
    }
}

async function addPrice() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const price = {
            nivel: document.getElementById('priceNivel').value.trim(),
            price: parseFloat(document.getElementById('priceValor').value)
        };
        if (!price.nivel || isNaN(price.price) || price.price < 0) {
            showNotification('Preencha todos os campos do preço e insira um valor válido.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/add-card-price?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(price)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Preço adicionado com sucesso!', false);
        closeAddPriceModal();
        await loadPrices();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em addPrice:', err);
    }
}

async function updatePrice() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const price = {
            _id: document.getElementById('editPriceId').value,
            nivel: document.getElementById('editPriceNivel').value.trim(),
            price: parseFloat(document.getElementById('editPriceValor').value)
        };
        if (!price.nivel || isNaN(price.price) || price.price < 0) {
            showNotification('Preencha todos os campos do preço e insira um valor válido.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/update-card-price?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(price)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Preço atualizado com sucesso!', false);
        closeEditPriceModal();
        await loadPrices();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em updatePrice:', err);
    }
}

async function deletePrice(id) {
    if (!confirm('Tem certeza que deseja excluir este preço?')) return;
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const response = await fetchWithTimeout(`/api/delete-card-price?userId=${encodeURIComponent(localStorage.getItem('userId'))}&id=${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Preço excluído com sucesso!', false);
        await loadPrices();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em deletePrice:', err);
    }
}

async function addUser() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const user = {
            username: document.getElementById('userUsername').value.trim(),
            password: document.getElementById('userPassword').value.trim(),
            balance: parseFloat(document.getElementById('userBalance').value),
            isAdmin: document.getElementById('userIsAdmin').value === 'true'
        };
        if (!user.username || !user.password || isNaN(user.balance) || user.balance < 0) {
            showNotification('Preencha todos os campos do usuário e insira um saldo válido.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/add-user?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Usuário adicionado com sucesso!', false);
        closeAddUserModal();
        await loadUsers();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em addUser:', err);
    }
}

async function updateUser() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const user = {
            _id: document.getElementById('editUserId').value,
            username: document.getElementById('editUserUsername').value.trim(),
            balance: parseFloat(document.getElementById('editUserBalance').value),
            isAdmin: document.getElementById('editUserIsAdmin').value === 'true'
        };
        if (!user.username || isNaN(user.balance) || user.balance < 0) {
            showNotification('Preencha todos os campos do usuário e insira um saldo válido.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/update-user?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Usuário atualizado com sucesso!', false);
        closeEditUserModal();
        await loadUsers();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em updateUser:', err);
    }
}

async function deleteUser(id) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const response = await fetchWithTimeout(`/api/delete-user?userId=${encodeURIComponent(localStorage.getItem('userId'))}&id=${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Usuário excluído com sucesso!', false);
        await loadUsers();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em deleteUser:', err);
    }
}

async function addBank() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const bank = {
            name: document.getElementById('bankName').value.trim()
        };
        if (!bank.name) {
            showNotification('Preencha o nome do banco.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/add-bank?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bank)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Banco adicionado com sucesso!', false);
        closeAddBankModal();
        await loadBanks();
        await loadModalOptions();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em addBank:', err);
    }
}

async function updateBank() {
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const bank = {
            _id: document.getElementById('editBankId').value,
            name: document.getElementById('editBankName').value.trim()
        };
        if (!bank.name) {
            showNotification('Preencha o nome do banco.', true);
            return;
        }
        const response = await fetchWithTimeout(`/api/update-bank?userId=${encodeURIComponent(localStorage.getItem('userId'))}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bank)
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Banco atualizado com sucesso!', false);
        closeEditBankModal();
        await loadBanks();
        await loadModalOptions();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em updateBank:', err);
    }
}

async function deleteBank(id) {
    if (!confirm('Tem certeza que deseja excluir este banco?')) return;
    try {
        document.getElementById('globalLoader').style.visibility = 'visible';
        const response = await fetchWithTimeout(`/api/delete-bank?userId=${encodeURIComponent(localStorage.getItem('userId'))}&id=${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }, 10000);
        const data = await response.json();
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification('Banco excluído com sucesso!', false);
        await loadBanks();
        await loadModalOptions();
    } catch (err) {
        document.getElementById('globalLoader').style.visibility = 'hidden';
        showNotification(`Erro: ${err.message}.`, true);
        if (isDevMode) console.error('Erro em deleteBank:', err);
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'cards') loadCards();
            else if (tab.dataset.tab === 'prices') loadPrices();
            else if (tab.dataset.tab === 'users') loadUsers();
            else if (tab.dataset.tab === 'banks') loadBanks();
        });
    });
}

function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    const isLight = body.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.innerHTML = `<i class="fas ${isLight ? 'fa-sun' : 'fa-moon'}"></i>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light');
        document.getElementById('themeToggle').innerHTML = `<i class="fas fa-sun"></i>`;
    }
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        localStorage.removeItem('cardFilters');
        showNotification('Saindo...', false);
        setTimeout(() => { window.location.href = '/index.html'; }, 1000);
    });
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    setupTabs();
    if (await checkEnvironment()) {
        if (await checkAuth()) {
            await loadCards();
        }
    } else {
        showNotification('Falha ao verificar ambiente do servidor. Tente novamente mais tarde.', true);
    }
});
