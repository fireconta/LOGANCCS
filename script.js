/**
 * script.js - Configurações globais, estado, Supabase e utilitários para LOGAN CC's
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
    lastAction: null
};

const SUPABASE_URL = 'https://iritzeslrciinopmhqgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyaXR6ZXNscmNpaW5vcG1ocWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkxMjYyNjQsImV4cCI6MjA2NDcwMjI2MH0.me1stNa7TUuR0tdpLlJT1hVjVvePTzReYfY8_jRO1xo';
try {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase inicializado:', SUPABASE_URL);
    window.supabaseClient = supabase; // Expor globalmente para testes
} catch (err) {
    console.error('Erro ao inicializar Supabase:', err);
}

const utils = {
    async withRetry(fn, retries = CONFIG.API_RETRY_COUNT, delay = CONFIG.API_RETRY_DELAY_MS) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                console.warn(`Tentativa ${attempt} falhou:`, error);
                if (attempt === retries) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    },

    checkAuth() {
        console.log('Verificando autenticação...');
        const sessionStart = localStorage.getItem('sessionStart');
        if (!sessionStart) {
            console.log('Nenhuma sessão encontrada.');
            return false;
        }
        const elapsedMinutes = (Date.now() - parseInt(sessionStart)) / (1000 * 60);
        if (elapsedMinutes > CONFIG.SESSION_DURATION_MINUTES) {
            console.log('Sessão expirada.');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('sessionStart');
            state.currentUser = null;
            return false;
        }
        state.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        console.log('Usuário autenticado:', state.currentUser);
        return !!state.currentUser.username;
    },

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
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
