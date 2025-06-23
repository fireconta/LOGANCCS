const Debug = {
    output: null,
    init() {
        try {
            this.output = document.getElementById('debugOutput');
            if (!this.output) {
                console.error('[ERRO] Elemento debugOutput não encontrado no DOM');
                return false;
            }
            console.log('[INFO] Debug inicializado com sucesso');
            return true;
        } catch (err) {
            console.error('[ERRO] Falha ao inicializar Debug:', err.message);
            return false;
        }
    },
    log(message, data = null) {
        try {
            const timestamp = new Date().toLocaleTimeString();
            const logMessage = `[${timestamp}] ${message}`;
            const formattedMessage = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}` : logMessage;
            console.log(logMessage, data || '');
            if (this.output) {
                this.output.textContent += `${formattedMessage}\n\n`;
                this.output.scrollTop = this.output.scrollHeight; // Auto-scroll
            }
        } catch (err) {
            console.error('[ERRO] Falha ao registrar log:', err.message);
        }
    },
    error(message, data = null) {
        try {
            const timestamp = new Date().toLocaleTimeString();
            const logMessage = `[${timestamp}] [ERRO] ${message}`;
            const formattedMessage = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}` : logMessage;
            console.error(logMessage, data || '');
            if (this.output) {
                this.output.textContent += `${formattedMessage}\n\n`;
                this.output.scrollTop = this.output.scrollHeight;
            }
        } catch (err) {
            console.error('[ERRO] Falha ao registrar erro:', err.message);
        }
    },
    warn(message, data = null) {
        try {
            const timestamp = new Date().toLocaleTimeString();
            const logMessage = `[${timestamp}] [AVISO] ${message}`;
            const formattedMessage = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}` : logMessage;
            console.warn(logMessage, data || '');
            if (this.output) {
                this.output.textContent += `${formattedMessage}\n\n`;
                this.output.scrollTop = this.output.scrollHeight;
            }
        } catch (err) {
            console.error('[ERRO] Falha ao registrar aviso:', err.message);
        }
    },
    toggle() {
        try {
            const panel = document.getElementById('debugPanel');
            if (!panel) throw new Error('Elemento debugPanel não encontrado');
            panel.classList.toggle('hidden');
            const button = document.getElementById('debugToggleButton');
            button.textContent = panel.classList.contains('hidden') ? 'Mostrar Debug' : 'Esconder Debug';
            console.log(`[INFO] Painel de debug ${panel.classList.contains('hidden') ? 'escondido' : 'exibido'}`);
        } catch (err) {
            console.error('[ERRO] Falha ao alternar painel de debug:', err.message);
        }
    }
};

// Inicializar Debug ao carregar
document.addEventListener('DOMContentLoaded', () => {
    if (Debug.init()) {
        Debug.log('[INFO] Módulo de debug carregado');
    }
});
