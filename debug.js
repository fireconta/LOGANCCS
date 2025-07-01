const Debug = {
    log: function(message, data = null) {
        const output = document.getElementById('debug-output');
        if (!output) return;
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const logDiv = document.createElement('div');
        logDiv.className = 'debug-info';
        logDiv.textContent = `[${timestamp}] INFO: ${message}`;
        if (data) {
            const dataDiv = document.createElement('div');
            dataDiv.textContent = JSON.stringify(data, null, 2);
            dataDiv.style.marginLeft = '1rem';
            dataDiv.style.fontFamily = 'monospace';
            logDiv.appendChild(dataDiv);
        }
        output.appendChild(logDiv);
        output.scrollTop = output.scrollHeight;
    },
    warn: function(message, data = null) {
        const output = document.getElementById('debug-output');
        if (!output) return;
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const logDiv = document.createElement('div');
        logDiv.className = 'debug-warn';
        logDiv.textContent = `[${timestamp}] WARN: ${message}`;
        if (data) {
            const dataDiv = document.createElement('div');
            dataDiv.textContent = JSON.stringify(data, null, 2);
            dataDiv.style.marginLeft = '1rem';
            dataDiv.style.fontFamily = 'monospace';
            logDiv.appendChild(dataDiv);
        }
        output.appendChild(logDiv);
        output.scrollTop = output.scrollHeight;
    },
    error: function(message, data = null) {
        const output = document.getElementById('debug-output');
        if (!output) return;
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const logDiv = document.createElement('div');
        logDiv.className = 'debug-error';
        logDiv.textContent = `[${timestamp}] ERROR: ${message}`;
        if (data) {
            const dataDiv = document.createElement('div');
            dataDiv.textContent = JSON.stringify(data, null, 2);
            dataDiv.style.marginLeft = '1rem';
            dataDiv.style.fontFamily = 'monospace';
            logDiv.appendChild(dataDiv);
        }
        output.appendChild(logDiv);
        output.scrollTop = output.scrollHeight;
    },
    success: function(message, data = null) {
        const output = document.getElementById('debug-output');
        if (!output) return;
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const logDiv = document.createElement('div');
        logDiv.className = 'debug-success';
        logDiv.textContent = `[${timestamp}] SUCCESS: ${message}`;
        if (data) {
            const dataDiv = document.createElement('div');
            dataDiv.textContent = JSON.stringify(data, null, 2);
            dataDiv.style.marginLeft = '1rem';
            dataDiv.style.fontFamily = 'monospace';
            logDiv.appendChild(dataDiv);
        }
        output.appendChild(logDiv);
        output.scrollTop = output.scrollHeight;
    }
};
