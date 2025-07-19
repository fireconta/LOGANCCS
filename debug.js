const debug = {
  enabled: false,
  panelId: null,

  init(panelId, enable) {
    this.panelId = panelId;
    this.enabled = enable && process.env.NODE_ENV !== 'production';
    if (this.enabled && document.getElementById(this.panelId)) {
      console.log('Debugging ativado');
    }
  },

  log(message) {
    if (this.enabled) {
      const sanitizedMessage = this.sanitize(message);
      console.log(`[DEBUG ${new Date().toLocaleString('pt-BR')}]: ${sanitizedMessage}`);
      const panel = document.getElementById(this.panelId);
      if (panel) {
        panel.innerHTML += `<p>${sanitizedMessage}</p>`;
      }
    }
  },

  error(message) {
    if (this.enabled) {
      const sanitizedMessage = this.sanitize(message);
      console.error(`[ERROR ${new Date().toLocaleString('pt-BR')}]: ${sanitizedMessage}`);
      const panel = document.getElementById(this.panelId);
      if (panel) {
        panel.innerHTML += `<p style="color: red;">${sanitizedMessage}</p>`;
      }
    }
  },

  sanitize(message) {
    return String(message).replace(/[<>&"']/g, '');
  }
};
