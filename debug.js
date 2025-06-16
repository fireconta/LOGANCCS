const debug = (msg) => {
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        debugDiv.appendChild(p);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
};
