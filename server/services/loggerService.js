/**
 * 📝 Logger Service
 * Provides structured JSON logging for production observability.
 */
class LoggerService {
    constructor() {
        this.defaultContext = { service: 'chat-server' };
    }

    /**
     * Internal helper to write JSON log
     * @param {string} level - INFO, WARN, ERROR, DEBUG
     * @param {string} message 
     * @param {object} context - Additional metadata
     */
    _write(level, message, context = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...this.defaultContext,
            ...context
        };
        // In production, you might pipe this to stdout/stderr which goes to CloudWatch/Datadog
        console.log(JSON.stringify(entry));
    }

    info(message, context) {
        this._write('INFO', message, context);
    }

    warn(message, context) {
        this._write('WARN', message, context);
    }

    error(message, error, context = {}) {
        const errorDetails = error ? {
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack
        } : {};

        this._write('ERROR', message, { ...context, ...errorDetails });
    }

    debug(message, context) {
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
            this._write('DEBUG', message, context);
        }
    }
}

export default new LoggerService();
