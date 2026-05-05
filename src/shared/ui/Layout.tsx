import React from 'react';
import { Sidebar as SidebarComponent } from '@/shared/ui/Sidebar';
import { useThemeStore, useAuthStore } from '@/shared/store/store';
import { Moon, Sun, Shield } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { isDarkMode, toggleTheme } = useThemeStore();
    const { user } = useAuthStore();

    return (
        <div className={`flex h-screen w-full overflow-hidden ${isDarkMode ? 'dark' : ''}`}>
            {/* Sidebar - Always present in Workspace */}
            <SidebarComponent />

            <div className="flex-1 flex flex-col h-full overflow-hidden relative">

                {/* Top Navbar */}
                <header className="h-14 flex items-center justify-between px-6 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                    <div className="flex items-center space-x-3">
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white">
                            INTELLIGENCE / <span className="text-zinc-400 dark:text-zinc-500 font-bold">ANALYSIS</span>
                        </span>
                        {user?.role === 'admin' && (
                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider border border-zinc-200 dark:border-zinc-700">
                                {user?.department || 'SYSTEM'}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden relative">
                    {children}
                </main>

            </div>
        </div>
    );
};
