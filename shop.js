/**
 * shop.js - Lógica para shop.html (Loja, Conta, Carteira, Recarga)
 */

const shop = {
    async loadCards() {
        if (!utils.checkAuth()) {
            ui.showError('global', 'Faça login para acessar a loja.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }

        ui.showLoader();
        ui.showNotification('Carregando cartões...', 'info');

        try {
            const [cardsResponse, userCardsResponse] = await Promise.all([
                utils.withRetry(() =>
                    supabase
                        .from('cards')
                        .select('*')
                        .eq('acquired', false)
                ),
                utils.withRetry(() =>
                    supabase
                        .from('cards')
                        .select('*')
                        .eq('user_id', state.currentUser.id)
                        .eq('acquired', true)
                )
            ]);

            if (cardsResponse.error) throw cardsResponse.error;
            if (userCardsResponse.error) throw userCardsResponse.error;

            state.cards = cardsResponse.data || [];
            state.userCards = userCardsResponse.data || [];
            ui.updateUserInfo();
            ui.filterCards();
            if (state.isAdmin) ui.showAdminButton();
            ui.loadUserCards();
            ui.showSuccess('Cartões carregados com sucesso!');
        } catch (error) {
            console.error('Erro ao carregar cartões:', error);
            ui.showError('global', 'Erro ao carregar cartões. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    showConfirmPurchaseModal(cardNumber) {
        const card = state.cards.find(c => c.numero === cardNumber);
        if (!card) {
            ui.showError('global', 'Cartão não encontrado.');
            return;
        }
        ui.showModal('confirmPurchaseModal', {
            cardDetails: card,
            totalAmount: (card.price || 10.00).toFixed(2),
            userBalance: state.currentUser.balance.toFixed(2),
            cardNumber
        });
    },

    async purchaseCard(cardNumber) {
        if (!utils.checkAuth()) {
            ui.showError('global', 'Faça login para comprar.');
            return;
        }

        const card = state.cards.find(c => c.numero === cardNumber);
        if (!card) {
            ui.showError('global', 'Cartão não encontrado.');
            return;
        }

        const price = card.price || 10.00;
        if (state.currentUser.balance < price) {
            ui.showError('purchase', 'Saldo insuficiente para esta compra.');
            return;
        }

        ui.showLoader();
        ui.showNotification('Processando compra...', 'info');

        try {
            const { data: user, error: userError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('id, balance')
                    .eq('id', state.currentUser.id)
                    .single()
            );

            if (userError || !user) throw new Error('Usuário não encontrado.');

            const { data: cardData, error: cardError } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .select('*')
                    .eq('numero', cardNumber)
                    .eq('acquired', false)
                    .single()
            );

            if (cardError || !cardData) throw new Error('Cartão não encontrado ou já comprado.');

            const newBalance = user.balance - price;
            const [updateUserResponse, updateCardResponse] = await Promise.all([
                utils.withRetry(() =>
                    supabase
                        .from('users')
                        .update({ balance: newBalance })
                        .eq('id', state.currentUser.id)
                ),
                utils.withRetry(() =>
                    supabase
                        .from('cards')
                        .update({ user_id: state.currentUser.id, acquired: true })
                        .eq('id', cardData.id)
                )
            ]);

            if (updateUserResponse.error) throw updateUserResponse.error;
            if (updateCardResponse.error) throw updateCardResponse.error;

            state.currentUser.balance = newBalance;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            state.cards = state.cards.filter(c => c.numero !== cardNumber);
            state.userCards.push(cardData);
            ui.closeModal('confirmPurchaseModal');
            ui.filterCards();
            ui.loadUserCards();
            ui.updateUserInfo();
            ui.showSuccess('Compra realizada com sucesso!');
        } catch (error) {
            console.error('Erro na compra:', error);
            ui.showError('purchase', 'Erro ao processar a compra. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async addBalance() {
        if (!utils.checkAuth()) {
            ui.showError('global', 'Faça login para adicionar saldo.');
            return;
        }

        const amount = parseFloat(document.getElementById('rechargeAmount')?.value);
        if (isNaN(amount) || amount <= 0) {
            ui.showError('recharge', 'Insira um valor válido maior que zero.');
            return;
        }

        ui.showLoader();
        ui.showNotification('Adicionando saldo...', 'info');

        try {
            const { data: user, error: userError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('id, balance')
                    .eq('id', state.currentUser.id)
                    .single()
            );

            if (userError || !user) throw new Error('Usuário não encontrado.');

            const newBalance = user.balance + amount;
            const { error: updateError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .update({ balance: newBalance })
                    .eq('id', state.currentUser.id)
            );

            if (updateError) throw updateError;

            state.currentUser.balance = newBalance;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            ui.closeModal('rechargeModal');
            ui.updateUserInfo();
            ui.showSuccess('Saldo adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar saldo:', error);
            ui.showError('recharge', 'Erro ao adicionar saldo. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    }
};

const ui = {
    showNotification(message, type = 'error') {
        const notificationsDiv = document.getElementById('notifications');
        if (!notificationsDiv) {
            console[type === 'error' ? 'error' : 'log'](message);
            return;
        }
        const notification = document.createElement('div');
        notification.className = `notification p-4 rounded-lg text-white shadow-lg ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`;
        notification.textContent = utils.sanitizeInput(message);
        notificationsDiv.appendChild(notification);
        setTimeout(() => notification.remove(), CONFIG.NOTIFICATION_DURATION_MS);
    },

    showError(context, message) {
        this.showNotification(message, 'error');
        const errorElement = document.getElementById(`${context}Error`);
        if (errorElement) {
            errorElement.textContent = utils.sanitizeInput(message);
            errorElement.classList.remove('hidden');
        }
    },

    showSuccess(message) {
        this.showNotification(message, 'success');
    },

    showLoader() {
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('show');
    },

    hideLoader() {
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.remove('show');
    },

    updateUserInfo() {
        const elements = {
            userBalanceHeader: state.currentUser ? `R$${state.currentUser.balance.toFixed(2)}` : 'R$0.00',
            userNameAccount: state.currentUser?.username || 'N/A',
            userBalanceAccount: state.currentUser ? `R$${state.currentUser.balance.toFixed(2)}` : 'R$0.00'
        };
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = utils.sanitizeInput(value);
        });
    },

    showAdminButton() {
        const adminButton = document.getElementById('adminButton');
        if (adminButton) adminButton.classList.remove('hidden');
    },

    filterCards() {
        if (!utils.debounce()) return;

        const cardList = document.getElementById('cardList');
        if (!cardList) return;

        const binFilter = document.getElementById('binFilter')?.value.trim() || '';
        const brandFilter = document.getElementById('brandFilter')?.value || 'all';
        const bankFilter = document.getElementById('bankFilter')?.value || 'all';
        const levelFilter = document.getElementById('levelFilter')?.value || 'all';

        if (binFilter && !/^\d{6}$/.test(binFilter)) {
            ui.showError('binFilter', 'O BIN deve conter 6 dígitos numéricos.');
            return;
        }

        const filteredCards = state.cards.filter(c =>
            (!binFilter || c.bin?.startsWith(binFilter)) &&
            (brandFilter === 'all' || c.bandeira === brandFilter) &&
            (bankFilter === 'all' || c.banco === bankFilter) &&
            (levelFilter === 'all' || c.nivel === levelFilter)
        );

        cardList.innerHTML = '';
        if (filteredCards.length === 0) {
            cardList.innerHTML = '<p class="text-center text-gray-400">Nenhum cartão disponível.</p>';
        } else {
            filteredCards.forEach(card => {
                const cardItem = document.createElement('div');
                cardItem.className = 'card-item';
                cardItem.innerHTML = `
                    <i class="fas fa-cc-${card.bandeira.toLowerCase()} card-brand"></i>
                    <div class="card-info">
                        <p><i class="fas fa-credit-card"></i> Número: ${utils.sanitizeInput(card.numero)}</p>
                        <p><i class="fas fa-university"></i> Banco: ${utils.sanitizeInput(card.banco)}</p>
                        <p><i class="fas fa-star"></i> Nível: ${utils.sanitizeInput(card.nivel)}</p>
                    </div>
                    <button class="card-button" data-card-number="${utils.sanitizeInput(card.numero)}">
                        Comprar por R$${card.price ? card.price.toFixed(2) : '10.00'}
                    </button>
                `;
                cardList.appendChild(cardItem);
            });
        }
    },

    clearFilters() {
        ['binFilter', 'brandFilter', 'bankFilter', 'levelFilter'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = id === 'binFilter' ? '' : 'all';
        });
        this.filterCards();
    },

    showAccountInfo() {
        if (!utils.checkAuth()) {
            this.showError('global', 'Faça login para acessar a conta.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }
        const cardList = document.getElementById('cardList');
        const accountInfo = document.getElementById('accountInfo');
        if (cardList && accountInfo) {
            cardList.classList.add('hidden');
            accountInfo.classList.remove('hidden');
            this.updateUserInfo();
            this.loadUserCards();
        }
    },

    showWallet() {
        if (!utils.checkAuth()) {
            this.showError('global', 'Faça login para acessar a carteira.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }
        this.showModal('walletModal');
        this.loadUserCardsWallet();
    },

    showAddBalanceForm() {
        if (!utils.checkAuth()) {
            this.showError('global', 'Faça login para adicionar saldo.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }
        this.showModal('rechargeModal');
    },

    loadUserCards() {
        const userCardsDiv = document.getElementById('userCards');
        if (!userCardsDiv) return;

        userCardsDiv.innerHTML = '';
        if (state.userCards.length === 0) {
            userCardsDiv.innerHTML = '<p class="text-center text-gray-400">Nenhum cartão adquirido.</p>';
        } else {
            state.userCards.forEach(card => {
                const cardItem = document.createElement('div');
                cardItem.className = 'card-item';
                cardItem.innerHTML = `
                    <i class="fas fa-cc-${card.bandeira.toLowerCase()} card-brand"></i>
                    <div class="card-info">
                        <p><i class="fas fa-credit-card"></i> Número: ${utils.sanitizeInput(card.numero)}</p>
                        <p><i class="fas fa-university"></i> Banco: ${utils.sanitizeInput(card.banco)}</p>
                        <p><i class="fas fa-star"></i> Nível: ${utils.sanitizeInput(card.nivel)}</p>
                    </div>
                `;
                userCardsDiv.appendChild(cardItem);
            });
        }
    },

    loadUserCardsWallet() {
        const userCardsWalletDiv = document.getElementById('userCardsWallet');
        if (!userCardsWalletDiv) return;

        userCardsWalletDiv.innerHTML = '';
        if (state.userCards.length === 0) {
            userCardsWalletDiv.innerHTML = '<p class="text-center text-gray-400">Nenhum cartão na carteira.</p>';
        } else {
            state.userCards.forEach(card => {
                const cardItem = document.createElement('div');
                cardItem.className = 'card-item';
                cardItem.innerHTML = `
                    <i class="fas fa-cc-${card.bandeira.toLowerCase()} card-brand"></i>
                    <div class="card-info">
                        <p><i class="fas fa-credit-card"></i> Número: ${utils.sanitizeInput(card.numero)}</p>
                        <p><i class="fas fa-university"></i> Banco: ${utils.sanitizeInput(card.banco)}</p>
                        <p><i class="fas fa-star"></i> Nível: ${utils.sanitizeInput(card.nivel)}</p>
                    </div>
                `;
                userCardsWalletDiv.appendChild(cardItem);
            });
        }
    },

    showModal(modalId, data = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modalId === 'confirmPurchaseModal' && data.cardDetails) {
            const details = document.getElementById('confirmCardDetails');
            const total = document.getElementById('confirmTotalAmount');
            const balance = document.getElementById('confirmUserBalance');
            if (details && total && balance) {
                details.innerHTML = `
                    <p><i class="fas fa-credit-card"></i> Número: ${utils.sanitizeInput(data.cardDetails.numero)}</p>
                    <p><i class="fas fa-university"></i> Banco: ${utils.sanitizeInput(data.cardDetails.banco)}</p>
                    <p><i class="fas fa-star"></i> Nível: ${utils.sanitizeInput(data.cardDetails.nivel)}</p>
                `;
                total.textContent = utils.sanitizeInput(data.totalAmount);
                balance.textContent = utils.sanitizeInput(data.userBalance);
            }
        }

        modal.classList.add('show');
        modal.focus();
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Inputmask
    Inputmask({ mask: '999999' }).mask(document.getElementById('binFilter'));

    // Carregar cartões
    shop.loadCards();

    // Filtros
    const filterInputs = ['binFilter', 'brandFilter', 'bankFilter', 'levelFilter'];
    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => ui.filterCards());
        }
    });

    // Botão Limpar Filtros
    const clearFiltersButton = document.getElementById('clearFiltersButton');
    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => ui.clearFilters());
    }

    // Botão Conta
    const accountButton = document.getElementById('accountButton');
    if (accountButton) {
        accountButton.addEventListener('click', () => ui.showAccountInfo());
    }

    // Botão Carteira
    const walletButton = document.getElementById('walletButton');
    if (walletButton) {
        walletButton.addEventListener('click', () => ui.showWallet());
    }

    // Botão Adicionar Saldo
    const addBalanceButton = document.getElementById('addBalanceButton');
    if (addBalanceButton) {
        addBalanceButton.addEventListener('click', () => ui.showAddBalanceForm());
    }

    // Botão Admin
    const adminButton = document.getElementById('adminButton');
    if (adminButton) {
        adminButton.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }

    // Botão Logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => auth.logout());
    }

    // Botões de Compra
    document.getElementById('cardList')?.addEventListener('click', e => {
        if (e.target.classList.contains('card-button')) {
            const cardNumber = e.target.dataset.cardNumber;
            shop.showConfirmPurchaseModal(cardNumber);
        }
    });

    // Botão Confirmar Compra
    const confirmPurchaseButton = document.getElementById('confirmPurchaseButton');
    if (confirmPurchaseButton) {
        confirmPurchaseButton.addEventListener('click', () => {
            const modal = document.getElementById('confirmPurchaseModal');
            const cardNumber = modal.querySelector('.card-button')?.dataset.cardNumber;
            if (cardNumber) shop.purchaseCard(cardNumber);
        });
    }

    // Botão Cancelar Compra
    const cancelPurchaseButton = document.getElementById('cancelPurchaseButton');
    if (cancelPurchaseButton) {
        cancelPurchaseButton.addEventListener('click', () => ui.closeModal('confirmPurchaseModal'));
    }

    // Botão Fechar Carteira
    const closeWalletButton = document.getElementById('closeWalletButton');
    if (closeWalletButton) {
        closeWalletButton.addEventListener('click', () => ui.closeModal('walletModal'));
    }

    // Botão Confirmar Adicionar Saldo
    const addBalanceConfirmButton = document.getElementById('addBalanceConfirmButton');
    if (addBalanceConfirmButton) {
        addBalanceConfirmButton.addEventListener('click', () => shop.addBalance());
    }

    // Botão Cancelar Adicionar Saldo
    const cancelRechargeButton = document.getElementById('cancelRechargeButton');
    if (cancelRechargeButton) {
        cancelRechargeButton.addEventListener('click', () => ui.closeModal('rechargeModal'));
    }

    // Fechar modais com tecla Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['confirmPurchaseModal', 'walletModal', 'rechargeModal'].forEach(modalId => ui.closeModal(modalId));
        }
    });
});