/**
 * script.js - Configurações globais e utilitários para LOGAN CC's
 */
const CONFIG = {
    API_RETRY_COUNT: 3,
    API_RETRY_DELAY_MS: 1000,
    NOTIFICATION_DURATION_MS: 5000,
    SESSION_DURATION_MINUTES: 60,
    DEBOUNCE_MS: 500
};

const state = {
    currentUser: null,
    lastAction: null,
    logs: []
};

function addLog(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    state.logs.push({ message, type, timestamp });
    if (state.logs.length > 100) state.logs.shift();
    console[type === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);
}

const utils = {
    async withRetry(fn, retries = CONFIG.API_RETRY_COUNT, delay = CONFIG.API_RETRY_DELAY_MS) {
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
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '''
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
    }
};
