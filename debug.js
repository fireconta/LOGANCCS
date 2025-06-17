const debugDiv = document.getElementById('debug');
const originalConsoleLog = console.log;
console.log = (...args) => {
    originalConsoleLog.apply(console, args);
    if (debugDiv) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        const p = document.createElement('p');
        p.textContent = message;
        debugDiv.appendChild(p);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
};
