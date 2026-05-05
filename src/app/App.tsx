import React, { useState } from 'react';
import { useAuthStore } from '@/shared/store/store';
import { Login } from '@/features/auth/Login';
import { Layout } from '@/shared/ui/Layout';
import { ChatInterface } from '@/features/chat/ChatInterface';
import { AdminDashboard } from '@/features/admin/AdminDashboard';


// Simple Router Context (Simulated)
export const RouterContext = React.createContext<{
    currentRoute: string;
    navigate: (route: string) => void;
}>({
    currentRoute: 'chat',
    navigate: () => { },
});

function App() {
    const { user } = useAuthStore();
    const [currentRoute, setCurrentRoute] = useState('chat');

    const navigate = (route: string) => setCurrentRoute(route);

    // 1. If not authenticated, show Login
    if (!user) {
        return <Login />;
    }

    // 2. Default: Chat Workspace with Routing (admin also uses chat)
    return (
        <RouterContext.Provider value={{ currentRoute, navigate }}>
            <Layout>
                {currentRoute === 'chat' && <ChatInterface />}
                {currentRoute === 'admin' && user.role === 'admin' && <AdminDashboard />}
            </Layout>
        </RouterContext.Provider>
    );
}

export default App;
