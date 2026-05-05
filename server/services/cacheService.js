import { LRUCache } from 'lru-cache';
import StrategyConfig from '../config/strategies.config.js';

/**
 * ⚡ Cache Service
 * Provides in-memory caching for various system components.
 * Namespaces: 'embedding', 'search', 'sql'
 */
class CacheService {
    constructor() {
        this.caches = new Map();
        this.initializeCaches();
    }

    initializeCaches() {
        const config = StrategyConfig.cache || { enabled: false, ttl: {} };
        if (!config.enabled) {
            console.log('ℹ️ [CacheService] Caching is DISABLED in config.');
            return;
        }

        // 1. Embeddings Cache (Long TTL, High Count)
        this.caches.set('embedding', new LRUCache({
            max: 5000,
            ttl: config.ttl.embedding || 1000 * 60 * 60 * 24, // Default 24h
            allowStale: false
        }));

        // 2. Search Results Cache (Short TTL, Medium Count)
        this.caches.set('search', new LRUCache({
            max: 200,
            ttl: config.ttl.search || 1000 * 60 * 5, // Default 5m
            allowStale: false
        }));

        // 3. SQL Results Cache (Medium TTL, Low Count)
        this.caches.set('sql', new LRUCache({
            max: 50,
            ttl: config.ttl.sql || 1000 * 60 * 10, // Default 10m
            allowStale: false
        }));

        console.log('✅ [CacheService] Initialized caches: embedding, search, sql');
    }

    /**
     * Get value from cache
     * @param {string} namespace - 'embedding' | 'search' | 'sql'
     * @param {string} key - Unique key
     * @returns {any | undefined}
     */
    get(namespace, key) {
        if (!this.caches.has(namespace)) return undefined;
        const cache = this.caches.get(namespace);
        const val = cache.get(key);
        if (val) {
            // Optional: console.debug(`[Cache] HIT (${namespace}): ${key.substring(0, 20)}...`);
        }
        return val;
    }

    /**
     * Set value in cache
     * @param {string} namespace 
     * @param {string} key 
     * @param {any} value 
     */
    set(namespace, key, value) {
        if (!this.caches.has(namespace)) return;
        this.caches.get(namespace).set(key, value);
    }

    /**
     * Flush a specific cache or all
     * @param {string} [namespace] 
     */
    flush(namespace) {
        if (namespace && this.caches.has(namespace)) {
            this.caches.get(namespace).clear();
            console.log(`[CacheService] Flushed namespace: ${namespace}`);
        } else {
            this.caches.forEach(c => c.clear());
            console.log('[CacheService] Flushed ALL caches.');
        }
    }

    getStats() {
        const stats = {};
        this.caches.forEach((cache, key) => {
            stats[key] = {
                size: cache.size,
                max: cache.max
            };
        });
        return stats;
    }
}

// Singleton
export default new CacheService();
