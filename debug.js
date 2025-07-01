const Debug = {
    log: function (message, data) {
        const debugOutput = document.getElementById('debug-output');
        if (!debugOutput) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const formattedMessage = `[${timestamp}] LOG: ${message}`;
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-info';
        logEntry.textContent = formattedMessage;
        if (data) {
            const dataEntry = document.createElement('pre');
            dataEntry.className = 'debug-info';
            dataEntry.textContent = JSON.stringify(data, null, 2);
            logEntry.appendChild(dataEntry);
        }
        debugOutput.appendChild(logEntry);
        debugOutput.scrollTop = debugOutput.scrollHeight;
    },
    warn: function (message) {
        const debugOutput = document.getElementById('debug-output');
        if (!debugOutput) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-warn';
        logEntry.textContent = `[${timestamp}] WARN: ${message}`;
        debugOutput.appendChild(logEntry);
        debugOutput.scrollTop = debugOutput.scrollHeight;
    },
    error: function (message) {
        const debugOutput = document.getElementById('debug-output');
        if (!debugOutput) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-error';
        logEntry.textContent = `[${timestamp}] ERROR: ${message}`;
        debugOutput.appendChild(logEntry);
        debugOutput.scrollTop = debugOutput.scrollHeight;
    },
    success: function (message) {
        const debugOutput = document.getElementById('debug-output');
        if (!debugOutput) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-success';
        logEntry.textContent = `[${timestamp}] SUCCESS: ${message}`;
        debugOutput.appendChild(logEntry);
        debugOutput.scrollTop = debugOutput.scrollHeight;
    },
    clear: function () {
        const debugOutput = document.getElementById('debug-output');
        if (debugOutput) debugOutput.innerHTML = '';
    }
};
