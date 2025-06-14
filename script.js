function debugLog(message) {
  const debug = document.getElementById('debug');
  if (debug) {
    const timestamp = new Date().toLocaleTimeString();
    debug.innerHTML += `[${timestamp}] ${message}<br>`;
    debug.scrollTop = debug.scrollHeight;
  }
  console.log(`[${timestamp}] ${message}`);
}

function formatCurrency(value) {
  return `R$ ${value.toFixed(2)}`;
}

debugLog('script.js carregado com sucesso');
