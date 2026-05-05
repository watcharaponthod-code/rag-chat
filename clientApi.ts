import { User, Message, ThoughtStep, Citation } from './style/types';

const API_BASE = '/api';

export const ApiService = {
    // --- Auth ---
    login: async (name: string, password: string) => {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password }),
        });

        if (!response.ok) {
            // Try to parse JSON error, fallback to text
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                throw new Error(json.message || 'Login failed');
            } catch (e) {
                throw new Error(`Login failed: ${text}`);
            }
        }
        return response.json();
    },

    register: async (formData: FormData) => {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                throw new Error(json.message || 'Registration failed');
            } catch (e) {
                throw new Error(`Registration failed: ${text}`);
            }
        }
        return response.json();
    },

    // --- Chat ---
    getClients: async (token: string) => {
        const response = await fetch(`${API_BASE}/chat/clients`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return response.json();
    },

    loadSession: async (sessionId: string, token: string) => {
        const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const error = new Error(`Server Error: ${response.status} ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
        }
        return response.json();
    },

    sendMessageStream: async (
        text: string,
        sessionId: string | null,
        token: string,
        signal: AbortSignal,
        analyzeIntent: boolean = true,
        options: { clientName?: string, agentMode?: boolean, chatMode?: 'doc' | 'mantis' | 'agent' } = {},
        callbacks: {
            onSessionCreated?: (id: string) => void,
            onToken?: (content: string) => void,
            onThoughts?: (thoughts: ThoughtStep[]) => void,
            onCitations?: (citations: Citation[]) => void,
            onRelatedImages?: (images: any[]) => void,
            onError?: (err: Error) => void
        }
    ) => {
        try {
            const response = await fetch(`${API_BASE}/chat/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: text,
                    sessionId: sessionId,
                    analyzeIntent: analyzeIntent,
                    clientName: options.clientName, // Pass clientName
                    chatMode: options.chatMode,
                    // Backward compatibility for older server handlers.
                    agentMode: options.agentMode ?? (options.chatMode === 'agent')
                }),
                signal: signal
            });

            if (!response.ok) {
                const error = new Error(`Server Error: ${response.status} ${response.statusText}`);
                (error as any).status = response.status;
                throw error;
            }
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.substring(6));

                        if (data.type === 'session_created') {
                            callbacks.onSessionCreated?.(data.sessionId);
                        } else if (data.type === 'token') {
                            callbacks.onToken?.(data.content);
                        } else if (data.type === 'thoughts') {
                            callbacks.onThoughts?.(data.thoughts);
                        } else if (data.type === 'citations') {
                            callbacks.onCitations?.(data.citations);
                        } else if (data.type === 'related_images') {
                            callbacks.onRelatedImages?.(data.images);
                        } else if (data.type === 'done') {
                            // Stream finished
                        }
                    } catch (e) {
                        console.error("Parse Error in stream:", e);
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                callbacks.onError?.(error);
            }
        }
    }
};
