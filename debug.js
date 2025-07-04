const debug = {
  init: function(id, enabled) {
    this.enabled = enabled;
    if (enabled) {
      const panel = document.createElement('div');
      panel.id = id;
      panel.style.position = 'fixed';
      panel.style.bottom = '10px';
      panel.style.right = '10px';
      panel.style.background = '#333';
      panel.style.color = '#fff';
      panel.style.padding = '10px';
      panel.style.maxHeight = '200px';
      panel.style.overflowY = 'auto';
      panel.style.zIndex = '1000';
      panel.style.fontSize = '12px';
      document.body.appendChild(panel);
    }
  },
  log: function(message) {
    if (this.enabled) {
      const panel = document.getElementById('debug-panel');
      if (panel) {
        const log = document.createElement('div');
        log.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        panel.appendChild(log);
        panel.scrollTop = panel.scrollHeight;
      }
      console.log(message);
    }
  },
  error: function(message) {
    if (this.enabled) {
      const panel = document.getElementById('debug-panel');
      if (panel) {
        const log = document.createElement('div');
        log.textContent = `[${new Date().toLocaleTimeString()}] ERROR: ${message}`;
        log.style.color = '#ff4444';
        panel.appendChild(log);
        panel.scrollTop = panel.scrollHeight;
      }
      console.error(message);
    }
  }
};
