const Debug = {
  enabled: true,
  uiElementId: 'debug',
  log(message, data = null) {
    if (!this.enabled) return;
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logMessage = `[INFO ${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    this.appendToUI(logMessage, data, 'info');
  },
  warn(message, data = null) {
    if (!this.enabled) return;
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logMessage = `[WARN ${timestamp}] ${message}`;
    console.warn(logMessage, data || '');
    this.appendToUI(logMessage, data, 'warn');
  },
  error(message, data = null) {
    if (!this.enabled) return;
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logMessage = `[ERROR ${timestamp}] ${message}`;
    console.error(logMessage, data || '');
    this.appendToUI(logMessage, data, 'error');
  },
  appendToUI(message, data, type) {
    const debugDiv = document.getElementById(this.uiElementId);
    if (!debugDiv) return;
    debugDiv.style.display = 'block';
    const entry = document.createElement('div');
    entry.className = `debug-${type}`;
    entry.textContent = message;
    if (data) {
      const dataEl = document.createElement('pre');
      dataEl.textContent = JSON.stringify(data, null, 2);
      entry.appendChild(dataEl);
    }
    debugDiv.appendChild(entry);
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Debug.log('debug.js carregado');
});
