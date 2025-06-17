(function () {
  const debugDiv = document.getElementById('debug');
  if (!debugDiv) return;

  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const logs = [];

  function appendLog(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] ${type}: ${message}`);
    if (logs.length > 50) logs.shift();
    debugDiv.innerHTML = logs.join('<br>');
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }

  console.log = function (...args) {
    appendLog('LOG', args.join(' '));
    originalConsoleLog.apply(console, args);
  };

  console.error = function (...args) {
    appendLog('ERROR', args.join(' '));
    originalConsoleError.apply(console, args);
  };

  window.onerror = function (msg, url, lineNo, columnNo, error) {
    appendLog('ERROR', `${msg} at ${url}:${lineNo}:${columnNo}`);
    return false;
  };

  debugDiv.style.display = process.env.NODE_ENV === 'development' ? 'block' : 'none';
})();
