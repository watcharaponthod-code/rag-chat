import Logger from '../services/loggerService.js';

/**
 * 🧱 Base Strategy (Interface)
 * All chat strategies must extend this class.
 */
export class BaseStrategy {
    constructor() {
        if (new.target === BaseStrategy) {
            throw new Error("Cannot instantiate BaseStrategy directly.");
        }
        this.name = this.constructor.name;
    }

    /**
     * Standardized Log Helper
     * @param {string} level - 'info' | 'warn' | 'error'
     * @param {string} message 
     */
    log(level, message) {
        // Map legacy levels to LoggerService methods
        if (level === 'error') Logger.error(message, null, { strategy: this.name });
        else if (level === 'warn') Logger.warn(message, { strategy: this.name });
        else Logger.info(message, { strategy: this.name });
    }

    /**
     * Main execution method.
     * @param {string} query - The original user message.
     * @param {object} intent - The intent object from the router.
     * @param {string} sessionId - The current session ID.
     * @param {object} user - The user object from request.
     * @param {object} res - The response stream.
     * @param {object[]} history - Recent chat history.
     */
    async execute(query, intent, sessionId, user, res, history) {
        throw new Error("Method 'execute' must be implemented.");
    }

    /**
     * Helper to send thoughts to the UI.
     * @param {object} res - Response stream
     * @param {object[]} thoughts - Array of thought objects
     */
    sendThoughts(res, thoughts) {
        if (res.writableEnded) return;
        res.write(`data: ${JSON.stringify({ type: 'thoughts', thoughts })}\n\n`);
    }

    /**
     * Helper to stream text.
     * @param {object} res - Response stream
     * @param {string} text - Text to stream
     */
    sendToken(res, text) {
        if (res.writableEnded) return;
        res.write(`data: ${JSON.stringify({ type: 'token', content: text })}\n\n`);
    }

    /**
     * Helper to finish stream.
     * @param {object} res - Response stream
     */
    endStream(res) {
        if (res.writableEnded) return;
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }

    /**
     * Handle errors gracefully.
     * @param {object} res - Response stream
     * @param {Error} error - The error object
     */
    handleError(res, error) {
        this.log('error', error.message);
        // Do not end stream here, let the controller or strategy decide if they want to fallback.
        // But if this is final, we might want to send a user-friendly error.
        if (!res.writableEnded) {
            this.sendToken(res, `\n\n**Strategy Error:** ${error.message}`);
            this.endStream(res);
        }
    }
}
