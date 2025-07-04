const debug = {
  enabled: false,
  panelId: null,

  init(panelId, enable) {
    this.panelId = panelId;
    this.enabled = enable;
    if (this.enabled) {
      console.log('Debugging ativado');
    }
  },

  log(message) {
    if (this.enabled) {
      console.log(`[DEBUG ${new Date().toLocaleString('pt-BR')}]: ${message}`);
      if (this.panelId) {
        const panel = document.getElementById(this.panelId);
        if (panel) {
          panel.innerHTML += `<p>[${new Date().toLocaleString('pt-BR')}]: ${message}</p>`;
        }
      }
    }
  },

  error(message) {
    if (this.enabled) {
      console.error(`[ERROR ${new Date().toLocaleString('pt-BR')}]: ${message}`);
      if (this.panelId) {
        const panel = document.getElementById(this.panelId);
        if (panel) {
          panel.innerHTML += `<p style="color: red;">[ERROR ${new Date().toLocaleString('pt-BR')}]: ${message}</p>`;
        }
      }
    }
  }
};
