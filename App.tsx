import React, { useState } from 'react';
import { useAuthStore } from './store';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { AdminDashboard } from './components/AdminDashboard';


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
