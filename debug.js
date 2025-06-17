(function () {
    console.log('debug.js carregado');

    function sanitizeInput(input) {
        if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
            return DOMPurify.sanitize(input);
        }
        return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/[<>]/g, '');
    }

    function addDebugMessage(message) {
        const debugDiv = document.getElementById('debug');
        if (!debugDiv) return;
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const messageDiv = document.createElement('div');
        messageDiv.textContent = `[${timestamp}] ${sanitizeInput(message)}`;
        debugDiv.appendChild(messageDiv);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }

    const originalConsoleLog = console.log;
    console.log = function (...args) {
        addDebugMessage(args.join(' '));
        originalConsoleLog.apply(console, args);
    };

    const originalConsoleError = console.error;
    console.error = function (...args) {
        addDebugMessage(`ERRO: ${args.join(' ')}`);
        originalConsoleError.apply(console, args);
    };
})();
