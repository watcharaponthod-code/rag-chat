
import split from 'split-string-words';

/**
 * ✂️ Shared Thai/English Tokenizer
 * Uses Intl.Segmenter (if available) or falls back to split-string-words.
 */
export const tokenizeText = (text) => {
    if (!text) return '';

    // 1. Try Native Intl.Segmenter (Best for Thai/Mixed)
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
            const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
            return [...segmenter.segment(text)]
                .filter(s => s.isWordLike) // Filter out spaces/punctuation
                .map(s => s.segment)
                .join(' ');
        } catch (e) {
            console.warn('Intl.Segmenter failed, falling back:', e);
        }
    }

    // 2. Fallback
    const clean = text.replace(/[^a-zA-Z0-9\u0E00-\u0E7F\s]/g, ' ');
    const words = split(clean).filter(w => w.length > 1);
    return words.join(' ');
};
