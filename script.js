/**
 * script.js - Configurações globais e utilitários para LOGAN CC's
 */
const CONFIG = {
    API_RETRY_COUNT: 25,
    API_RETRY_INTERVAL_MS: 1000,
    NOTIFICATION_DURATION_MS: 5000,
    SESSION_DURATION_MINUTES: 60,
    DEBOUNCE_MS: 500
};

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDM3k33LjBRZmm9nXzLsABlxef_zaOmAKU",
    authDomain: "loganccs-b030c.firebaseapp.com",
    projectId: "loganccs-b030c",
    storageBucket: "loganccs-b030c.firebasestorage.app",
    messagingSenderId: "1022430732687",
    appId: "1:1022430732687:web:40bd56c677f7f95e6d6bfa",
    measurementId: "G-GPY8ET904E"
};

// Estado global
const state = {
    currentUser: null,
    lastAction: null,
    logs: []
};

// Função de log
function addLog(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    state.logs.push({ message, type, timestamp });
    if (state.logs.length > 100) state.logs.shift();
    console[type === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);
}

// Utilitários
const utils = {
    async withRetry(fn, retries = CONFIG.API_RETRY_COUNT, delay = CONFIG.API_RETRY_INTERVAL_MS) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                addLog(`Tentativa ${attempt} falhou: ${error.message}`, 'error');
                if (attempt === retries) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    },

    checkAuth() {
        addLog('Verificando autenticação...');
        const sessionStart = localStorage.getItem('sessionStart');
        if (!sessionStart) {
            addLog('Nenhuma sessão encontrada.');
            return false;
        }
        const elapsedMinutes = (Date.now() - parseInt(sessionStart)) / (1000 * 60);
        if (elapsedMinutes > CONFIG.SESSION_DURATION_MINUTES) {
            addLog('Sessão expirada.');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('sessionStart');
            state.currentUser = null;
            return false;
        }
        state.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        addLog('Usuário autenticado: ' + JSON.stringify(state.currentUser));
        return !!state.currentUser.username;
    },

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;'
        })[char]);
    },

    validateCardNumber(cardNumber) {
        const digits = cardNumber.replace(/\D/g, '');
        if (digits.length !== 16) return false;
        let sum = 0;
        let isEven = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let digit = parseInt(digits[i]);
            if (isEven) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
        }
        return sum % 10 === 0;
    },

    validateCVV(cvv) {
        return /^\d{3}$/.test(cvv);
    },

    validateExpiry(expiry) {
        return /^\d{2}\/\d{2}$/.test(expiry);
    },

    validateCPF(cpf) {
        return /^\d{11}$/.test(cpf);
    },

    debounce() {
        if (!state.lastAction) {
            state.lastAction = Date.now();
            return true;
        }
        const now = Date.now();
        if (now - state.lastAction >= CONFIG.DEBOUNCE_MS) {
            state.lastAction = now;
            return true;
        }
        return false;
    },

    // Inicializar banco de dados
    async initializeDatabase(db, ui) {
        try {
            // Verificar coleção 'users'
            const usersSnapshot = await db.collection('users').get();
            if (usersSnapshot.empty) {
                const initialUsers = [
                    {
                        username: "LVz",
                        password: "123456",
                        balance: 1000.00,
                        is_admin: true,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    }
                ];
                for (const user of initialUsers) {
                    const docRef = await db.collection('users').add(user);
                    addLog(`Usuário ${user.username} criado com ID ${docRef.id}.`);
                    ui.showNotification(`Usuário ${user.username} criado!`, 'success');
                }
            } else {
                addLog('Coleção users já existe, pulando criação.');
            }

            // Verificar coleção 'cards'
            const cardsSnapshot = await db.collection('cards').get();
            if (cardsSnapshot.empty) {
                const initialCards = [
                    {
                        numero: "4532015112830366",
                        cvv: "123",
                        expiry: "12/27",
                        name: "João Silva",
                        cpf: "12345678901",
                        bandeira: "Visa",
                        banco: "Nubank",
                        nivel: "Platinum",
                        price: 25.00,
                        bin: "453201",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "5555666677778884",
                        cvv: "456",
                        expiry: "06/28",
                        name: "Maria Oliveira",
                        cpf: "98765432109",
                        bandeira: "Mastercard",
                        banco: "Itaú",
                        nivel: "Black",
                        price: 50.00,
                        bin: "555566",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "3782822463100059",
                        cvv: "789",
                        expiry: "03/29",
                        name: "Pedro Santos",
                        cpf: "45678912345",
                        bandeira: "Amex",
                        banco: "Bradesco",
                        nivel: "Gold",
                        price: 30.00,
                        bin: "378282",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "6362970000457013",
                        cvv: "321",
                        expiry: "09/26",
                        name: "Ana Costa",
                        cpf: "78912345678",
                        bandeira: "Elo",
                        banco: "Santander",
                        nivel: "Classic",
                        price: 10.00,
                        bin: "636297",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "6062825624254001",
                        cvv: "654",
                        expiry: "11/28",
                        name: "Lucas Pereira",
                        cpf: "32165498712",
                        bandeira: "Hipercard",
                        banco: "Banco do Brasil",
                        nivel: "Platinum",
                        price: 20.00,
                        bin: "606282",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "3056930902590481",
                        cvv: "987",
                        expiry: "05/30",
                        name: "Fernanda Lima",
                        cpf: "65498732145",
                        bandeira: "Diners Club",
                        banco: "Caixa Econômica Federal",
                        nivel: "Black",
                        price: 45.00,
                        bin: "305693",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "4532731234567890",
                        cvv: "147",
                        expiry: "08/27",
                        name: "Rafael Almeida",
                        cpf: "14725836901",
                        bandeira: "Visa",
                        banco: "Sicredi",
                        nivel: "Classic",
                        price: 5.00,
                        bin: "453273",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "5456789012345678",
                        cvv: "258",
                        expiry: "02/29",
                        name: "Camila Souza",
                        cpf: "25836914702",
                        bandeira: "Mastercard",
                        banco: "Sicoob",
                        nivel: "Gold",
                        price: 15.00,
                        bin: "545678",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "5091234567890123",
                        cvv: "369",
                        expiry: "04/28",
                        name: "Gabriel Mendes",
                        cpf: "36914725803",
                        bandeira: "Elo",
                        banco: "Nubank",
                        nivel: "Platinum",
                        price: 35.00,
                        bin: "509123",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    },
                    {
                        numero: "4539123456789012",
                        cvv: "741",
                        expiry: "07/29",
                        name: "Beatriz Rocha",
                        cpf: "74125836904",
                        bandeira: "Visa",
                        banco: "Itaú",
                        nivel: "Black",
                        price: 40.00,
                        bin: "453912",
                        acquired: false,
                        user_id: null,
                        created_at: "2025-06-10 13:58:23.787395+00"
                    }
                ];
                for (const card of initialCards) {
                    const docRef = await db.collection('cards').add(card);
                    addLog(`Cartão ${card.numero} criado com ID ${docRef.id}.`);
                    ui.showNotification(`Cartão ${card.numero.slice(-4)} criado!`, 'success');
                }
            } else {
                addLog('Coleção cards já existe, pulando criação.');
            }
            addLog('Banco de dados inicializado com sucesso.');
            ui.showNotification('Banco de dados configurado!', 'success');
        } catch (err) {
            addLog(`Erro ao inicializar banco: ${err.message}`, 'error');
            ui.showNotification('Erro ao configurar o banco.', 'error');
        }
    }
};
