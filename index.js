/**
 * index.js - Lógica para index.html (Login e Registro)
 */

const auth = {
    async login(username, password) {
        if (!utils.debounce()) {
            ui.showError('login', 'Aguarde antes de tentar novamente.');
            return;
        }

        username = utils.sanitizeInput(username);
        password = utils.sanitizeInput(password);

        if (!username || !password) {
            ui.showError('login', 'Usuário e senha são obrigatórios.');
            return;
        }

        if (username.length < 3 || !/^[a-zA-Z0-9]+$/.test(username)) {
            ui.showError('login', 'Usuário deve ter pelo menos 3 caracteres alfanuméricos.');
            return;
        }

        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            ui.showError('login', `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        if (state.loginBlockedUntil > Date.now()) {
            const timeLeft = Math.ceil((state.loginBlockedUntil - Date.now()) / 1000);
            ui.showError('login', `Bloqueado por muitas tentativas. Aguarde ${timeLeft} segundos.`);
            return;
        }

        ui.toggleLoading('loginButton', true);
        ui.showNotification('Verificando usuário...', 'info');

        try {
            const { data, error } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('id, username, password, balance, is_admin')
                    .eq('username', username)
                    .single()
            );

            if (error || !data) {
                state.loginAttempts++;
                if (state.loginAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
                    state.loginBlockedUntil = Date.now() + CONFIG.LOGIN_BLOCK_TIME_MS;
                    ui.showError('login', 'Muitas tentativas. Aguarde 5 minutos.');
                    return;
                }
                ui.showError('login', 'Usuário ou senha inválidos.');
                return;
            }

            if (data.password !== password) {
                state.loginAttempts++;
                if (state.loginAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
                    state.loginBlockedUntil = Date.now() + CONFIG.LOGIN_BLOCK_TIME_MS;
                    ui.showError('login', 'Muitas tentativas. Aguarde 5 minutos.');
                    return;
                }
                ui.showError('login', 'Senha incorreta.');
                return;
            }

            state.currentUser = {
                id: data.id,
                username: data.username,
                balance: data.balance || 0,
                is_admin: data.is_admin || false
            };
            state.isAdmin = data.is_admin || false;
            state.loginAttempts = 0;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            localStorage.setItem('sessionStart', Date.now().toString());
            ui.showSuccess(`Bem-vindo, ${username}!`);
            ui.clearForm('login');
            setTimeout(() => window.location.href = 'shop.html', 1000);
        } catch (error) {
            console.error('Erro no login:', error);
            let mensagemErro = 'Erro ao conectar. Tente novamente mais tarde.';
            if (error.code === 'PGRST116') {
                mensagemErro = 'Usuário ou senha inválidos.';
            } else if (error.message.includes('network')) {
                mensagemErro = 'Sem conexão com a internet. Verifique sua rede.';
            } else if (error.code === '42501') {
                mensagemErro = 'Acesso negado ao banco de dados. Contate o suporte.';
            }
            ui.showError('login', mensagemErro);
        } finally {
            ui.toggleLoading('loginButton', false);
        }
    },

    async register(username, password, confirmPassword) {
        if (!utils.debounce()) {
            ui.showError('register', 'Aguarde antes de tentar novamente.');
            return;
        }

        username = utils.sanitizeInput(username);
        password = utils.sanitizeInput(password);
        confirmPassword = utils.sanitizeInput(confirmPassword);

        if (!username || !password || !confirmPassword) {
            ui.showError('register', 'Todos os campos são obrigatórios.');
            return;
        }

        if (username.length < 3 || !/^[a-zA-Z0-9]+$/.test(username)) {
            ui.showError('register', 'Usuário deve ter pelo menos 3 caracteres alfanuméricos.');
            return;
        }

        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            ui.showError('register', `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        if (password !== confirmPassword) {
            ui.showError('register', 'As senhas não coincidem.');
            return;
        }

        ui.toggleLoading('registerButton', true);
        ui.showNotification('Criando conta...', 'info');

        try {
            const { data: existingUser, error: checkError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .select('username')
                    .eq('username', username)
                    .single()
            );

            if (existingUser) {
                ui.showError('register', 'Este usuário já existe.');
                return;
            }

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }

            const { error: insertError } = await utils.withRetry(() =>
                supabase
                    .from('users')
                    .insert([{ username, password, balance: 0, is_admin: false }])
            );

            if (insertError) throw insertError;

            ui.showSuccess('Conta criada com sucesso! Faça login para continuar.');
            ui.clearForm('register');
            ui.toggleForms();
        } catch (error) {
            console.error('Erro no registro:', error);
            let mensagemErro = 'Erro ao registrar. Tente novamente mais tarde.';
            if (error.code === '23505') {
                mensagemErro = 'Usuário já existe.';
            } else if (error.message.includes('network')) {
                mensagemErro = 'Sem conexão com a internet. Verifique sua rede.';
            } else if (error.code === '42501') {
                mensagemErro = 'Acesso negado ao banco de dados. Contate o suporte.';
            }
            ui.showError('register', mensagemErro);
        } finally {
            ui.toggleLoading('registerButton', false);
        }
    },

    logout() {
        state.currentUser = null;
        state.isAdmin = false;
        state.loginAttempts = 0;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('sessionStart');
        ui.showSuccess('Logout realizado com sucesso!');
        window.location.href = 'index.html';
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

    toggleLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = isLoading;
            button.innerHTML = isLoading
                ? '<i class="fas fa-spinner fa-spin mr-2"></i> Carregando...'
                : button.dataset.originalText || button.innerHTML;
            if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
        }
    },

    toggleForms() {
        const loginContainer = document.getElementById('loginContainer');
        const registerContainer = document.getElementById('registerContainer');
        if (loginContainer && registerContainer) {
            loginContainer.classList.toggle('hidden');
            registerContainer.classList.toggle('hidden');
            this.showNotification('Formulário alterado.', 'info');
        }
    },

    clearForm(context) {
        const fields = {
            login: ['username', 'password'],
            register: ['newUsername', 'newPassword', 'confirmPassword']
        }[context] || [];
        fields.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        const errorElement = document.getElementById(`${context}Error`);
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.add('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', () => {
            auth.login(
                document.getElementById('username').value.trim(),
                document.getElementById('password').value.trim()
            );
        });
    }

    const registerButton = document.getElementById('registerButton');
    if (registerButton) {
        registerButton.addEventListener('click', () => {
            auth.register(
                document.getElementById('newUsername').value.trim(),
                document.getElementById('newPassword').value.trim(),
                document.getElementById('confirmPassword').value.trim()
            );
        });
    }

    const toggleRegister = document.getElementById('toggleRegister');
    if (toggleRegister) {
        toggleRegister.addEventListener('click', () => ui.toggleForms());
    }

    const toggleLogin = document.getElementById('toggleLogin');
    if (toggleLogin) {
        toggleLogin.addEventListener('click', () => ui.toggleForms());
    }
});