(function() {
  // Redireciona console.log, console.error, console.warn para debugLog
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn
  };

  window.debugLog = function(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    const debug = document.getElementById('debug');
    let formattedMessage = `[${timestamp}] ${message}`;
    if (typeof message === 'object') {
      formattedMessage = `[${timestamp}] ${JSON.stringify(message, null, 2)}`;
    }
    if (debug) {
      const messageElement = document.createElement('div');
      messageElement.className = type === 'error' ? 'text-red-400' : type === 'warn' ? 'text-yellow-400' : 'text-white';
      messageElement.textContent = formattedMessage;
      debug.appendChild(messageElement);
      debug.scrollTop = debug.scrollHeight;
    }
    originalConsole[type](formattedMessage);
  };

  console.log = (...args) => {
    args.forEach(arg => debugLog(arg, 'log'));
    originalConsole.log(...args);
  };
  console.error = (...args) => {
    args.forEach(arg => debugLog(arg, 'error'));
    originalConsole.error(...args);
  };
  console.warn = (...args) => {
    args.forEach(arg => debugLog(arg, 'warn'));
    originalConsole.warn(...args);
  };

  // Inicializa debug
  document.addEventListener('DOMContentLoaded', () => {
    const debug = document.getElementById('debug');
    if (debug) {
      debugLog('Debug inicializado');
    }
  });
})();
