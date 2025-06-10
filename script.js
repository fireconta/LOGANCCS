/**
 * script.js - Configurações Globais
 * Contém configurações, estado global, inicialização do Supabase e utilitários.
 */

// --- Configuração ---
const CONFIG = {
    SESSION_TIMEOUT_MINUTES: 60,
    MIN_PASSWORD_LENGTH: 6,
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_BLOCK_TIME_MS: 300000,
    NOTIFICATION_DURATION_MS: 5000,
    SUPABASE_URL: 'https://iritzeslrciinopmhqgn.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyaXR6ZXNscmNpaW5vcG1ocWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkxMjYyNjQsImV4cCI6MjA2NDcwMjI2MH0.me1stNa7TUuR0tdpLlJT1hVjVvePTzReYfY8_jRO1xo',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    DEBOUNCE_DELAY_MS: 500
};

// --- Estado ---
const state = {
    currentUser: JSON.parse(localStorage.getItem('currentUser')) || null,
    isAdmin: false,
    loginAttempts: 0,
    loginBlockedUntil: 0,
    sessionStart: parseInt(localStorage.getItem('sessionStart')) || 0,
    lastActionTime: 0,
    cards: [],
    userCards: []
};

// --- Cliente Supabase ---
const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
console.log('Supabase inicializado:', CONFIG.SUPABASE_URL);

// --- Funções Utilitárias ---
const utils = {
    async withRetry(queryFn, attempts = CONFIG.RETRY_ATTEMPTS) {
        for (let i = 0; i <= attempts; i++) {
            try {
                return await queryFn();
            } catch (error) {
                if (i === attempts) throw error;
                console.warn(`Tentativa ${i + 1} falhou: ${error.message}. Retentando...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
            }
        }
    },

    checkAuth() {
        if (!state.currentUser?.id) {
            console.warn('checkAuth: Usuário não logado.');
            return false;
        }
        const sessionDuration = (Date.now() - state.sessionStart) / 1000 / 60;
        if (sessionDuration > CONFIG.SESSION_TIMEOUT_MINUTES) {
            console.warn('checkAuth: Sessão expirada.');
            auth.logout();
            return false;
        }
        return true;
    },

    sanitizeInput(input) {
        return DOMPurify.sanitize(input || '');
    },

    validateCardNumber(number) {
        const cleaned = number.replace(/\s/g, '');
        if (cleaned.length !== 16 || !/^\d+$/.test(cleaned)) return false;
        // Algoritmo de Luhn
        let sum = 0;
        for (let i = 0; i < cleaned.length; i++) {
            let digit = parseInt(cleaned[i]);
            if (i % 2 === 0) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
        }
        return sum % 10 === 0;
    },

    validateCardCvv(cvv) {
        return cvv.length === 3 && /^\d+$/.test(cvv);
    },

    validateCardExpiry(expiry) {
        const [month, year] = expiry.split('/');
        if (!month || !year || month.length !== 2 || year.length !== 2) return false;
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(`20${year}`, 10);
        if (monthNum < 1 || monthNum > 12) return false;
        const currentDate = new Date();
        const expiryDate = new Date(yearNum, monthNum - 1, 1);
        return expiryDate >= currentDate;
    },

    validateCardCpf(cpf) {
        const cleaned = cpf.replace(/[\.-]/g, '');
        return cleaned.length === 11 && /^\d+$/.test(cleaned);
    },

    debounce() {
        const now = Date.now();
        if (now - state.lastActionTime < CONFIG.DEBOUNCE_DELAY_MS) {
            console.warn('Ação bloqueada por debounce.');
            return false;
        }
        state.lastActionTime = now;
        return true;
    }
};