const Debug = {
    info: function(message, ...args) {
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
            console.log(`[INFO] ${message}`, ...args);
        }
    },
    error: function(message, ...args) {
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
};
