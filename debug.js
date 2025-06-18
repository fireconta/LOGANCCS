const Debug = {
    log: (message, data = {}) => {
        console.log(`[DEBUG] ${message}`, data);
        const debugDiv = document.getElementById('debug');
        if (debugDiv) {
            const entry = document.createElement('div');
            entry.className = 'debug-info';
            entry.textContent = `[INFO] ${message}: ${JSON.stringify(data)}`;
            debugDiv.appendChild(entry);
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
    },
    error: (message, data = {}) => {
        console.error(`[ERROR] ${message}`, data);
        const debugDiv = document.getElementById('debug');
        if (debugDiv) {
            const entry = document.createElement('div');
            entry.className = 'debug-error';
            entry.textContent = `[ERROR] ${message}: ${JSON.stringify(data)}`;
            debugDiv.appendChild(entry);
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Debug.log('debug.js carregado');
});
