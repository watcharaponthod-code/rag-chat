import { create } from 'zustand';
declare var process: any;
// Re-initializing store logic
import { User, Role, MCPConnector, Message, ThoughtStep, Citation } from '@/shared/style/types';

// --- Theme Store ---
interface ThemeState {
    isDarkMode: boolean;
    toggleTheme: () => void;
}

const getInitialTheme = () => {
    const stored = localStorage.getItem('theme');
    if (stored) {
        return stored === 'dark';
    }
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useThemeStore = create<ThemeState>((set) => {
    // Apply initial theme immediately
    const initialDarkMode = getInitialTheme();
    if (initialDarkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    return {
        isDarkMode: initialDarkMode,
        toggleTheme: () => set((state) => {
            const newMode = !state.isDarkMode;
            if (newMode) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
            return { isDarkMode: newMode };
        }),
    };
});

// --- Auth Store (Refactored) ---
import { ApiService } from '@/shared/api/clientApi';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    token: string | null;
    login: (name: string, password: string) => Promise<void>;
    register: (name: string, password: string, department: string, avatar?: File | null) => Promise<void>;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    return {
        user: storedUser ? JSON.parse(storedUser) : null,
        token: storedToken,
        isLoading: false,

        login: async (name: string, password: string) => {
            set({ isLoading: true });
            try {
                const data = await ApiService.login(name, password);
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                // Clear previous session on login
                useChatStore.getState().clearSession();

                set({ user: data.user, token: data.token, isLoading: false });
            } catch (error) {
                console.error('Login error:', error);
                set({ isLoading: false });
                throw error;
            }
        },

        register: async (name: string, password: string, department: string, avatar?: File | null) => {
            set({ isLoading: true });
            try {
                const formData = new FormData();
                formData.append('name', name);
                formData.append('password', password);
                formData.append('department', department);
                if (avatar) formData.append('avatar', avatar);

                await ApiService.register(formData);
                set({ isLoading: false });
            } catch (error) {
                console.error('Registration error:', error);
                set({ isLoading: false });
                throw error;
            }
        },

        logout: () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            set({ user: null, token: null });
        },
    };
});

// --- Ephemeral Chat Store ---
interface ChatState {
    mcpConnectors: MCPConnector[];
    messages: Message[];
    isThinking: boolean;
    currentSessionId: string | null;
    abortController: AbortController | null;
    isMediaFullscreen: boolean;

    // Client Filter
    clients: string[];
    selectedClient: string | null;
    fetchClients: () => Promise<void>;
    setSelectedClient: (client: string | null) => void;

    toggleMCP: (id: string) => void;
    addMessage: (message: Message) => void;
    setMessages: (messages: Message[]) => void;
    updateLastMessage: (content: string, thoughts?: ThoughtStep[], citations?: Citation[], relatedImages?: any[]) => void;
    clearSession: () => void;
    setCurrentSessionId: (id: string | null) => void;
    sendMessage: (text: string, attachment?: File | null, options?: { analyzeIntent?: boolean }) => Promise<void>;
    stopGeneration: () => void;
    loadSession: (sessionId: string) => Promise<void>;
    setMediaFullscreen: (val: boolean) => void;
    // Chat Mode: mantis, doc, agent
    chatMode: 'mantis' | 'doc' | 'agent';
    setChatMode: (mode: 'mantis' | 'doc' | 'agent') => void;
}

const DEFAULT_MCPS: MCPConnector[] = [
    { id: '1', name: 'ERP Database (SQL)', description: 'Access raw sales data', isConnected: true, type: 'database' },
    { id: '2', name: 'HR Policies (Vector)', description: 'Employee handbook RAG', isConnected: true, type: 'files' },
    { id: '3', name: 'Salesforce CRM', description: 'Customer records', isConnected: true, type: 'api' },
];

export const useChatStore = create<ChatState>((set, get) => ({
    mcpConnectors: DEFAULT_MCPS,
    messages: [],
    isThinking: false,
    currentSessionId: null,
    abortController: null,
    isMediaFullscreen: false,

    // Client Filter State
    clients: [],
    selectedClient: null,

    // Chat Mode: 'mantis' | 'doc' | 'agent'
    chatMode: 'doc',
    setChatMode: (mode) => set({ chatMode: mode }),

    toggleMCP: (id) => set((state) => ({
        mcpConnectors: state.mcpConnectors.map(mcp =>
            mcp.id === id ? { ...mcp, isConnected: !mcp.isConnected } : mcp
        )
    })),

    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

    setMessages: (messages) => set({ messages }),

    updateLastMessage: (content, thoughts, citations, relatedImages) => set((state) => {
        const newMessages = state.messages.map((msg, index) => {
            if (index === state.messages.length - 1 && msg.role === 'assistant') {
                return {
                    ...msg,
                    content: content,
                    thoughts: thoughts || msg.thoughts,
                    citations: citations || msg.citations,
                    relatedImages: relatedImages || msg.relatedImages
                };
            }
            return msg;
        });
        return { messages: newMessages };
    }),

    clearSession: () => set({ messages: [], isThinking: false, currentSessionId: null, abortController: null }),

    setCurrentSessionId: (id) => set({ currentSessionId: id }),

    // Client Actions
    fetchClients: async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const clients = await ApiService.getClients(token);
                set({ clients });
            }
        } catch (e) { console.error('Failed to fetch clients', e); }
    },
    setSelectedClient: (client) => set({ selectedClient: client }),
    setMediaFullscreen: (val) => set({ isMediaFullscreen: val }),

    stopGeneration: () => {
        const { abortController } = get();
        if (abortController) {
            abortController.abort();
            set({ isThinking: false, abortController: null });
        }
    },

    loadSession: async (sessionId) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("No token");
            const messages = await ApiService.loadSession(sessionId, token);
            set({ messages, currentSessionId: sessionId });
        } catch (error: any) {
            console.error('Failed to load session:', error);
            if (error.status === 403) {
                useAuthStore.getState().logout();
            }
        }
    },

    sendMessage: async (text, attachment, options) => {
        const { addMessage, updateLastMessage, currentSessionId, selectedClient } = get(); // Get selectedClient

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
            fileAttachment: attachment ? attachment.name : undefined
        };
        addMessage(userMsg);

        const controller = new AbortController();
        set({ isThinking: true, abortController: controller });

        const aiMsgId = (Date.now() + 1).toString();
        addMessage({
            id: aiMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            thoughts: [{ id: 't1', icon: 'process', description: 'Thinking...', status: 'active' }]
        });

        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication required");

            let currentContent = '';

            await ApiService.sendMessageStream(
                text,
                currentSessionId,
                token,
                controller.signal,
                options?.analyzeIntent ?? true,
                { clientName: selectedClient || undefined, chatMode: get().chatMode }, // Pass selectedClient and chatMode
                {
                    onSessionCreated: (sid) => set({ currentSessionId: sid }),
                    onToken: (chunk) => {
                        currentContent += chunk;
                        updateLastMessage(currentContent);
                    },
                    onThoughts: (thoughts) => updateLastMessage(currentContent, thoughts),
                    onCitations: (citations) => updateLastMessage(currentContent, undefined, citations),
                    onRelatedImages: (images) => updateLastMessage(currentContent, undefined, undefined, images),
                    onError: (err) => { throw err; }
                }
            );

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                if (error.status === 403) {
                    useAuthStore.getState().logout();
                    return;
                }
                const errMsg = error.message.includes('Server Error')
                    ? 'Error connecting to server. Please check your connection.'
                    : error.message;
                updateLastMessage(`${errMsg}`);
            }
        } finally {
            set(state => ({
                isThinking: false,
                abortController: null,
                messages: state.messages.map(m => m.id === aiMsgId ? { ...m, isStreaming: false } : m)
            }));
        }
    }
}));
