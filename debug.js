const Debug = {
  log: (message, data = {}) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-info';
      logEntry.textContent = `[${timestamp}] ${message}`;
      if (Object.keys(data).length) {
        const dataEntry = document.createElement('pre');
        dataEntry.textContent = JSON.stringify(data, null, 2);
        logEntry.appendChild(dataEntry);
      }
      debugDiv.appendChild(logEntry);
      debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    console.log(`[${timestamp}] ${message}`, data);
  },
  warn: (message, data = {}) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-warn';
      logEntry.textContent = `[${timestamp}] WARN: ${message}`;
      if (Object.keys(data).length) {
        const dataEntry = document.createElement('pre');
        dataEntry.textContent = JSON.stringify(data, null, 2);
        logEntry.appendChild(dataEntry);
      }
      debugDiv.appendChild(logEntry);
      debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    console.warn(`[${timestamp}] WARN: ${message}`, data);
  },
  error: (message, data = {}) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-error';
      logEntry.textContent = `[${timestamp}] ERROR: ${message}`;
      if (Object.keys(data).length) {
        const dataEntry = document.createElement('pre');
        dataEntry.textContent = JSON.stringify(data, null, 2);
        logEntry.appendChild(dataEntry);
      }
      debugDiv.appendChild(logEntry);
      debugDiv.scrollTop = debugDiv.scrollHeight;
    }
    console.error(`[${timestamp}] ERROR: ${message}`, data);
  }
};
