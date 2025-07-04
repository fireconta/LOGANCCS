const Debug = {
  log: (message) => {
    const debugOutput = document.getElementById('debug-output');
    if (debugOutput) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-info';
      logEntry.textContent = DOMPurify.sanitize(`[${new Date().toLocaleTimeString()}] ${message}`);
      debugOutput.appendChild(logEntry);
      debugOutput.scrollTop = debugOutput.scrollHeight;
    }
  },
  warn: (message) => {
    const debugOutput = document.getElementById('debug-output');
    if (debugOutput) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-warn';
      logEntry.textContent = DOMPurify.sanitize(`[${new Date().toLocaleTimeString()}] WARN: ${message}`);
      debugOutput.appendChild(logEntry);
      debugOutput.scrollTop = debugOutput.scrollHeight;
    }
  },
  error: (message) => {
    const debugOutput = document.getElementById('debug-output');
    if (debugOutput) {
      const logEntry = document.createElement('div');
      logEntry.className = 'debug-error';
      logEntry.textContent = DOMPurify.sanitize(`[${new Date().toLocaleTimeString()}] ERROR: ${message}`);
      debugOutput.appendChild(logEntry);
      debugOutput.scrollTop = debugOutput.scrollHeight;
    }
  },
  clear: () => {
    const debugOutput = document.getElementById('debug-output');
    if (debugOutput) {
      debugOutput.innerHTML = '';
    }
  }
};

function showDebugNotification(message, isError = false) {
  const notifications = document.getElementById('notifications');
  if (notifications) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
    notification.innerHTML = DOMPurify.sanitize(message) + '<button onclick="this.parentElement.remove()" class="text-white hover:text-gray-300">✖</button>';
    notifications.appendChild(notification);
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  }
}
