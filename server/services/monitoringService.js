import Logger from './loggerService.js';

/**
 * 📊 Monitoring Service
 * Tracks performance metrics and system health.
 */
class MonitoringService {
    constructor() {
        this.timers = new Map();
    }

    /**
     * Start a timer for a specific operation
     * @param {string} id - Unique ID (e.g., requestId)
     * @param {string} label - Operation label (e.g., 'db_query')
     */
    startTimer(id, label) {
        const key = `${id}:${label}`;
        this.timers.set(key, process.hrtime());
    }

    /**
     * End a timer and log the duration
     * @param {string} id 
     * @param {string} label 
     * @returns {number} Duration in milliseconds
     */
    endTimer(id, label) {
        const key = `${id}:${label}`;
        if (!this.timers.has(key)) return 0;

        const start = this.timers.get(key);
        const diff = process.hrtime(start);
        const durationMs = (diff[0] * 1000) + (diff[1] / 1e6);

        this.timers.delete(key);

        Logger.info(`Performance: ${label}`, {
            metric: 'latency',
            label,
            durationMs: durationMs.toFixed(2),
            requestId: id
        });

        return durationMs;
    }

    /**
     * Track token usage (if available)
     * @param {string} id 
     * @param {object} usage - { input, output, total }
     */
    trackTokens(id, usage = {}) {
        Logger.info('Token Usage', {
            metric: 'tokens',
            requestId: id,
            ...usage
        });
    }
}

export default new MonitoringService();
