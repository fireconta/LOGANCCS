/**
 * dashboard.js - Lógica para dashboard.html (Admin)
 */

const admin = {
    async loadUsers() {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado. Faça login como administrador.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }

        ui.showLoader();
        ui.showNotification('Carregando usuários...', 'info');

        try {
            const { data, error } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('id, username, balance, is_admin')
            );

            if (error) throw error;

            state.users = data || [];
            ui.displayUsers();
            ui.showSuccess('Usuários carregados com sucesso!');
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            ui.showError('global', 'Erro ao carregar usuários. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async loadCards() {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado. Faça login como administrador.');
            setTimeout(() => window.location.href = 'index.html', 1000);
            return;
        }

        ui.showLoader();
        ui.showNotification('Carregando cartões...', 'info');

        try {
            const { data, error } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .select('*')
            );

            if (error) throw error;

            state.cards = data || [];
            ui.displayAdminCards();
            ui.showSuccess('Cartões carregados com sucesso!');
        } catch (error) {
            console.error('Erro ao carregar cartões:', error);
            ui.showError('global', 'Erro ao carregar cartões. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async saveUser(userId, username, password, balance, isAdmin) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!utils.debounce()) {
            ui.showError('editUser', 'Aguarde antes de tentar novamente.');
            return;
        }

        username = utils.sanitizeInput(username);
        password = utils.sanitizeInput(password);
        balance = parseFloat(balance);
        isAdmin = isAdmin === 'true';

        if (!username || isNaN(balance) || balance < 0) {
            ui.showError('editUser', 'Preencha todos os campos corretamente.');
            return;
        }

        if (password && password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            ui.showError('editUser', `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        ui.showLoader();
        ui.showNotification('Salvando usuário...', 'info');

        try {
            const updateData = { balance, is_admin: isAdmin };
            if (password) updateData.password = password;

            const { error } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', userId)
            );

            if (error) throw error;

            const userIndex = state.users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                state.users[userIndex] = { ...state.users[userIndex], username, balance, is_admin: isAdmin };
            }
            ui.displayUsers();
            ui.closeModal('editUserModal');
            ui.showSuccess('Usuário atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            ui.showError('editUser', 'Erro ao salvar usuário. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async addUser(username, password, balance, isAdmin) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!utils.debounce()) {
            ui.showError('addUser', 'Aguarde antes de tentar novamente.');
            return;
        }

        username = utils.sanitizeInput(username);
        password = utils.sanitizeInput(password);
        balance = parseFloat(balance);
        isAdmin = isAdmin === 'true';

        if (!username || !password || isNaN(balance) || balance < 0) {
            ui.showError('addUser', 'Preencha todos os campos corretamente.');
            return;
        }

        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            ui.showError('addUser', `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        ui.showLoader();
        ui.showNotification('Adicionando usuário...', 'info');

        try {
            const { data: existingUser, error: checkError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('username')
                    .eq('username', username)
                    .single()
            );

            if (existingUser) {
                ui.showError('addUser', 'Este usuário já existe.');
                return;
            }

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }

            const { data, error } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .insert([{ username, password, balance, is_admin: isAdmin }])
                    .select()
            );

            if (error) throw error;

            state.users.push(data[0]);
            ui.displayUsers();
            ui.closeModal('addUserModal');
            ui.showSuccess('Usuário adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar usuário:', error);
            ui.showError('addUser', 'Erro ao adicionar usuário. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async deleteUser(userId) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

        ui.showLoader();
        ui.showNotification('Excluindo usuário...', 'info');

        try {
            const { error } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .delete()
                    .eq('id', userId)
            );

            if (error) throw error;

            state.users = state.users.filter(u => u.id !== userId);
            ui.displayUsers();
            ui.showSuccess('Usuário excluído com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            ui.showError('global', 'Erro ao excluir usuário. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async saveCard(cardId, cardData) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!utils.debounce()) {
            ui.showError('editCard', 'Aguarde antes de tentar novamente.');
            return;
        }

        const { numero, cvv, expiry, name, cpf, bandeira, banco, nivel, price } = cardData;
        const sanitizedData = {
            numero: utils.sanitizeInput(numero),
            cvv: utils.sanitizeInput(cvv),
            expiry: utils.sanitizeInput(expiry),
            name: utils.sanitizeInput(name),
            cpf: utils.sanitizeInput(cpf),
            bandeira: utils.sanitizeInput(bandeira),
            banco: utils.sanitizeInput(banco),
            nivel: utils.sanitizeInput(nivel),
            price: parseFloat(price),
            bin: utils.sanitizeInput(numero.substring(0, 6))
        };

        if (!utils.validateCardNumber(sanitizedData.numero)) {
            ui.showError('editCard', 'Número do cartão inválido.');
            return;
        }

        if (!utils.validateCardCvv(sanitizedData.cvv)) {
            ui.showError('editCard', 'CVV inválido.');
            return;
        }

        if (!utils.validateCardExpiry(sanitizedData.expiry)) {
            ui.showError('editCard', 'Data de validade inválida.');
            return;
        }

        if (!sanitizedData.name) {
            ui.showError('editCard', 'Nome é obrigatório.');
            return;
        }

        if (!utils.validateCardCpf(sanitizedData.cpf)) {
            ui.showError('editCard', 'CPF inválido.');
            return;
        }

        if (!sanitizedData.bandeira || !sanitizedData.banco || !sanitizedData.nivel || isNaN(sanitizedData.price) || sanitizedData.price <= 0) {
            ui.showError('editCard', 'Preencha todos os campos corretamente.');
            return;
        }

        ui.showLoader();
        try {
            const { error } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .update(sanitizedData)
                    .eq('id', cardId)
            );

            if (error) throw error;

            const cardIndex = state.cards.findIndex(c => c.id === cardId);
            if (cardIndex !== -1) {
                state.cards[cardIndex] = { ...state.cards[cardIndex], ...sanitizedData };
            }
            ui.displayAdminCards();
            ui.closeModal('editCardModal');
            ui.showSuccess('Cartão atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar cartão:', error);
            ui.showError('editCard', 'Erro ao salvar cartão. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async addCard(cardData) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!utils.debounce()) {
            ui.showError('addCard', 'Aguarde antes de tentar novamente.');
            return;
        }

        const { numero, cvv, expiry, name, cpf, bandeira, banco, nivel, price } = cardData;
        const sanitizedData = {
            numero: utils.sanitizeInput(numero),
            cvv: utils.sanitizeInput(cvv),
            expiry: utils.sanitizedInput(expiry),
            name: utils.sanitizedInput(name),
            cpf: utils.sanitizedInput(cpf),
            bandeira: utils.sanitizedInput(bandeira),
            banco: utils.sanitizedInput(banco),
            nivel: utils.sanitizedInput(nivel),
            price: parseFloat(price),
            bin: utils.sanitizedInput(numero.substring(0, 6)),
            acquired: false,
            user_id: null
        };

        if (!utils.validateCardNumber(sanitizedData.numero)) {
            ui.showError('addCard', 'Número do cartão inválido.');
            return;
        }

        if (!utils.validateCardCvv(sanitizedData.cvv)) {
            ui.showError('addCard', 'CVV inválido.');
            return;
        }

        if (!utils.validateCardExpiry(sanitizedData.expiry)) {
            ui.showError('addCard', 'Data de validade inválida.');
            return;
        }

        if (!sanitizedData.name) {
            ui.showError('addCard', 'Nome é obrigatório.');
            return;
        }

        if (!utils.validateCardCpf(sanitizedData.cpf)) {
            ui.showError('addCard', 'CPF inválido.');
            return;
        }

        if (!sanitizedData.bandeira || !sanitizedData.banco || !sanitizedData.nivel || isNaN(sanitizedData.price) || sanitizedData.price <= 0) {
            ui.showError('addCard', 'Preencha todos os campos corretamente.');
            return;
        }

        ui.showLoader();
        ui.showNotification('Adicionando cartão...', 'info');

        try {
            const { data: existingCard, error: checkError } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .select('numero')
                    .eq('numero', sanitizedData.numero)
                    .single()
            );

            if (existingCard) {
                ui.showError('addCard', 'Este cartão já existe.');
                return;
            }

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }

            const { data, error } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .insert([sanitizedData])
                    .select('*')
            );

            if (error) throw error;

            state.cards.push(data[0]);
            ui.displayAdminCards();
            ui.closeModal('addCardModal');
            ui.showSuccess('Cartão adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar cartão:', error);
            ui.showError('addCard', 'Erro ao adicionar cartão. Tente novamente.');
        } finally {
            ui.hideLoader();
        }
    },

    async deleteCard(cardId) {
        if (!utils.checkAuth() || !state.isAdmin) {
            ui.showError('global', 'Acesso negado.');
            return;
        }

        if (!confirm('Tem certeza que deseja excluir este cartão?')) return;

        ui.showLoader();
        ui.showNotification('Excluindo cartão...', 'info');

        try {
            const { error } = await utils.withRetry(() =>
                supabase
                    .from('cards')
                    .delete()
                    .eq('id', cardId)
            );

            if (error) throw error;

            state.cards = state.cards.filter(c => c.id !== cardId);
            ui.displayAdminCards();
            ui.showSuccess('Cartão excluído com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir cartão:', error);
            ui.showError('global', 'Erro ao excluir cartão. Tente novamente.');
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

    displayUsers() {
        const userTableBody = document.querySelector('#userList table tbody');
        if (!userTableBody) return;

        userTableBody.innerHTML = '';
        if (state.users.length === 0) {
            userTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500">Nenhum usuário encontrado.</td></tr>';
        } else {
            state.users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${utils.sanitizeInput(user.username)}</td>
                    <td>R$${user.balance.toFixed(2)}</td>
                    <td>${user.is_admin ? 'Sim' : 'Não'}</td>
                    <td>
                        <button class="action-button edit-user-btn" data-user-id="${user.id}"><i class="fas fa-edit mr-1"></i></button>
                        <button class="delete-button delete-user-btn" data-user-id="${user.id}"><i class="fas fa-trash mr-1"></i></button>
                    </td>
                `;
                userTableBody.appendChild(row);
            });
        }
    },

    displayAdminCards() {
        const cardsTableBody = document.querySelector('#adminCardList tbody');
        if (!cardsTableBody) return;

        cardsTableBody.innerHTML = '';
        if (state.cards.length === 0) {
            cardsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500">Nenhum cartão encontrado.</td></tr>';
        } else {
            state.cards.forEach(card => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${utils.sanitizeInput(card.numero)}</td>
                    <td>${utils.sanitizeInput(card.bandeira)}</td>
                    <td>${utils.sanitizeInput(card.banco)}</td>
                    <td>${utils.sanitizeInput(card.nivel)}</td>
                    <td>
                        <button class="action-button edit-card-btn" data-card-id="${card.id}"><i class="fas fa-edit mr-1"></i></button>
                        <button class="delete-button delete-card-btn" data-card-id="${card.id}"><i class="fas fa-trash mr-1"></i></button>
                    </td>
                `;
                cardsTableBody.appendChild(row);
            });
        }
    },

    showModal(modalId, data = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modalId === 'editUserModal' && data) {
            document.getElementById('editUsername').value = utils.sanitizeInput(data.username);
            document.getElementById('editBalance').value = data.balance;
            document.getElementById('editIsAdmin').value = data.is_admin ? 'true' : 'false';
            document.getElementById('editPassword').value = '';
        } else if (modalId === 'editCardModal' && data) {
            document.getElementById('editCardNumber').value = utils.sanitizeInput(data.numero);
            document.getElementById('editCardCvv').value = utils.sanitizeInput(data.cvv);
            document.getElementById('editCardExpiry').value = utils.sanitizeInput(data.expiry);
            document.getElementById('editCardName').value = utils.sanitizeInput(data.name);
            document.getElementById('editCardCpf').value = utils.sanitizeInput(data.cpf);
            document.getElementById('editCardBandeira').value = utils.sanitizeInput(data.bandeira);
            document.getElementById('editCardBanco').value = utils.sanitizeInput(data.banco);
            document.getElementById('editCardNivel').value = utils.sanitizeInput(data.nivel);
            document.getElementById('editCardPrice').value = data.price;
        } else if (modalId === 'addUserModal' || modalId === 'addCardModal') {
            const form = modal.querySelector('form');
            if (form) form.reset();
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
    Inputmask({ mask: '9999 9999 9999 9999' }).mask(document.getElementById('editCardNumber'));
    Inputmask({ mask: '9999 9999 9999 9999' }).mask(document.getElementById('cardNumber'));
    Inputmask({ mask: '999' }).mask(document.getElementById('editCardCvv'));
    Inputmask({ mask: '999' }).mask(document.getElementById('cardCvv'));
    Inputmask({ mask: '99/99' }).mask(document.getElementById('editCardExpiry'));
    Inputmask({ mask: '99/99' }).mask(document.getElementById('cardExpiry'));
    Inputmask({ mask: '999.999.999-99' }).mask(document.getElementById('editCardCpf'));
    Inputmask({ mask: '999.999.999-99' }).mask(document.getElementById('cardCpf'));

    // Carregar dados
    admin.loadUsers();
    admin.loadCards();

    // Botão Adicionar Usuário
    const addUserButton = document.getElementById('addUserButton');
    if (addUserButton) {
        addUserButton.addEventListener('click', () => ui.showModal('addUserModal'));
    }

    // Botão Adicionar Cartão
    const addCardButton = document.getElementById('addCardButton');
    if (addCardButton) {
        addCardButton.addEventListener('click', () => ui.showModal('addCardModal'));
    }

    // Botão Loja
    const shopButton = document.getElementById('shopButton');
    if (shopButton) {
        shopButton.addEventListener('click', () => {
            window.location.href = 'shop.html';
        });
    }

    // Botão Logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => auth.logout());
    }

    // Botões de Editar e Excluir Usuários
    document.getElementById('userList')?.addEventListener('click', e => {
        if (e.target.closest('.edit-user-btn')) {
            const userId = parseInt(e.target.closest('.edit-user-btn').dataset.userId);
            const user = state.users.find(u => u.id === userId);
            if (user) ui.showModal('editUserModal', user);
        } else if (e.target.closest('.delete-user-btn')) {
            const userId = parseInt(e.target.closest('.delete-user-btn').dataset.userId);
            admin.deleteUser(userId);
        }
    });

    // Botões de Editar e Excluir Cartões
    document.getElementById('adminCardList')?.addEventListener('click', e => {
        if (e.target.closest('.edit-card-btn')) {
            const cardId = parseInt(e.target.closest('.edit-card-btn').dataset.cardId);
            const card = state.cards.find(c => c.id === cardId);
            if (card) ui.showModal('editCardModal', card);
        } else if (e.target.closest('.delete-card-btn')) {
            const cardId = parseInt(e.target.closest('.delete-card-btn').dataset.cardId);
            admin.deleteCard(cardId);
        }
    });

    // Botão Salvar Usuário
    const saveUserButton = document.getElementById('saveUserButton');
    if (saveUserButton) {
        saveUserButton.addEventListener('click', () => {
            const userId = parseInt(document.querySelector('.edit-user-btn').dataset.userId);
            admin.saveUser(
                userId,
                document.getElementById('editUsername').value,
                document.getElementById('editPassword').value,
                document.getElementById('editBalance').value,
                document.getElementById('editIsAdmin').value
            );
        });
    }

    // Botão Cancelar Editar Usuário
    const cancelUserButton = document.getElementById('cancelUserButton');
    if (cancelUserButton) {
        cancelUserButton.addEventListener('click', () => ui.closeModal('editUserModal'));
    }

    // Botão Adicionar Usuário
    const addUserConfirmButton = document.getElementById('addUserConfirmButton');
    if (addUserConfirmButton) {
        addUserConfirmButton.addEventListener('click', () => {
            admin.addUser(
                document.getElementById('newUsername').value,
                document.getElementById('newPassword').value,
                document.getElementById('newBalance').value,
                document.getElementById('newIsAdmin').value
            );
        });
    }

    // Botão Cancelar Adicionar Usuário
    const cancelAddUserButton = document.getElementById('cancelAddUserButton');
    if (cancelAddUserButton) {
        cancelAddUserButton.addEventListener('click', () => ui.closeModal('addUserModal'));
    }

    // Botão Salvar Cartão
    const saveCardButton = document.getElementById('saveCardButton');
    if (saveCardButton) {
        saveCardButton.addEventListener('click', () => {
            const cardId = parseInt(document.querySelector('.edit-card-btn').dataset.cardId);
            admin.saveCard(cardId, {
                numero: document.getElementById('editCardNumber').value,
                cvv: document.getElementById('editCardCvv').value,
                expiry: document.getElementById('editCardExpiry').value,
                name: document.getElementById('editCardName').value,
                cpf: document.getElementById('editCardCpf').value,
                bandeira: document.getElementById('editCardBandeira').value,
                banco: document.getElementById('editCardBanco').value,
                nivel: document.getElementById('editCardNivel').value,
                price: document.getElementById('editCardPrice').value
            });
        });
    }

    // Botão Cancelar Editar Cartão
    const cancelCardButton = document.getElementById('cancelCardButton');
    if (cancelCardButton) {
        cancelCardButton.addEventListener('click', () => ui.closeModal('editCardModal'));
    }

    // Botão Adicionar Cartão
    const addCardConfirmButton = document.getElementById('addCardConfirmButton');
    if (addCardConfirmButton) {
        addCardConfirmButton.addEventListener('click', () => {
            admin.addCard({
                numero: document.getElementById('cardNumber').value,
                cvv: document.getElementById('cardCvv').value,
                expiry: document.getElementById('cardExpiry').value,
                name: document.getElementById('cardName').value,
                cpf: document.getElementById('cardCpf').value,
                bandeira: document.getElementById('cardBandeira').value,
                banco: document.getElementById('cardBanco').value,
                nivel: document.getElementById('cardNivel').value,
                price: document.getElementById('cardPrice').value
            });
        });
    }

    // Botão Cancelar Adicionar Cartão
    const cancelAddCardButton = document.getElementById('cancelAddCardButton');
    if (cancelAddCardButton) {
        cancelAddCardButton.addEventListener('click', () => ui.closeModal('addCardModal'));
    }

    // Fechar modais com tecla Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['editBalanceModal', 'editUserModal', 'addUserModal', 'editCardModal', 'addCardModal'].forEach(modalId => ui.closeModal(modalId));
        }
});