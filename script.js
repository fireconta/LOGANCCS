/**
 * script.js - Configurações globais para LOGAN CC's
 */
window.addLog('script.js carregado', 'log');

window.CONFIG = {
    API_RETRY_COUNT: 3,
    API_RETRY_DELAY_MS: 1000,
    NOTIFICATION_DURATION_MS: 5000,
    SESSION_DURATION_MINUTES: 60,
    DEBOUNCE_MS: 500
};

window.firebaseConfig = {
    apiKey: "AIzaSyDM3k33LjBRZmm9nXzLsABlxef_zaOmAKU",
    authDomain: "loganccs-b030c.firebaseapp.com",
    projectId: "loganccs-b030c",
    storageBucket: "loganccs-b030c.firebasestorage.app",
    messagingSenderId: "1022430732687",
    appId: "1:1022430732687:web:40bd56c677f7f95e6d6bfa",
    measurementId: "G-GPY8ET904E"
};

window.state = {
    currentUser: null,
    lastAction: null,
    logs: []
};

window.addLog = function(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    window.state.logs.push({ message, type, timestamp });
    if (window.state.logs.length > 100) window.state.logs.shift();
    console[type === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);
    // Log visível na interface para Android
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        debugDiv.innerHTML += `<div class="${type}">[${timestamp}] ${message}</div>`;
    }
};

window.utils = {
    async withRetry(fn, retries = window.CONFIG.API_RETRY_COUNT, delay = window.CONFIG.API_RETRY_DELAY_MS) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                window.addLog(`Tentativa ${attempt} falhou: ${error.message}`, 'error');
                if (attempt === retries) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    },

    checkAuth() {
        window.addLog('Verificando autenticação...');
        const sessionStart = localStorage.getItem('sessionStart');
        if (!sessionStart) {
            window.addLog('Nenhuma sessão encontrada.');
            return false;
        }
        const elapsedMinutes = (Date.now() - parseInt(sessionStart)) / (1000 * 60);
        if (elapsedMinutes > window.CONFIG.SESSION_DURATION_MINUTES) {
            window.addLog('Sessão expirada.');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('sessionStart');
            window.state.currentUser = null;
            return false;
        }
        window.state.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        window.addLog('Usuário autenticado: ' + JSON.stringify(window.state.currentUser));
        return !!window.state.currentUser.username;
    },

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[&<>"']/g, char => ({
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '''
        })[char]);
    },

    debounce() {
        if (!window.state.lastAction) {
            window.state.lastAction = Date.now();
            return true;
        }
        const now = Date.now();
        if (now - window.state.lastAction >= window.CONFIG.DEBOUNCE_MS) {
            window.state.lastAction = now;
            return true;
        }
        return false;
    },

    async initializeDatabase(db, ui) {
        try {
            window.addLog('Iniciando configuração do banco...');
            const usersSnapshot = await db.collection('users').get();
            if (usersSnapshot.empty) {
                const user = {
                    username: "LVz",
                    password: "123456",
                    balance: 1000.00,
                    is_admin: true,
                    created_at: "2025-06-10 13:58:23.787395+00"
                };
                const docRef = await db.collection('users').add(user);
                window.addLog(`Usuário ${user.username} criado com ID ${docRef.id}.`);
                ui.showNotification(`Usuário ${user.username} criado!`, 'success');
            } else {
                window.addLog('Coleção users já existe.');
            }

            const cardsSnapshot = await db.collection('cards').get();
            if (cardsSnapshot.empty) {
                const cards = [
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
                    }
                ];
                for (const card of cards) {
                    const docRef = await db.collection('cards').add(card);
                    window.addLog(`Cartão ${card.numero.slice(-4)} criado com ID ${docRef.id}.`);
                    ui.showNotification(`Cartão ${card.numero.slice(-4)} criado!`, 'success');
                }
            } else {
                window.addLog('Coleção cards já existe.');
            }
            window.addLog('Banco de dados configurado.');
            ui.showNotification('Banco de dados OK!', 'success');
        } catch (err) {
            window.addLog(`Erro ao configurar banco: ${err.message}`, 'error');
            ui.showNotification('Erro ao configurar banco.', 'error');
        }
    }
};
