/**
 * script.js - Funções principais para LOGAN CC's
 */
window.addLog('script.js carregado com sucesso', 'log');

window.state = {
    logs: []
};

window.addLog = function(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    window.state.logs.push({ message, type, timestamp });
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        debugDiv.innerHTML += `<div class="${type}">[${timestamp}] ${message}</div>`;
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
};
