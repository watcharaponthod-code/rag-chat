import React, { useState, useEffect, useContext } from 'react';
import { useChatStore, useAuthStore } from '@/shared/store/store';
import { RouterContext } from '../../app/App';
import {
    RefreshCw,
    LogOut,
    X,
    Shield,
    CheckCircle,
    Lock,
    MessageSquare,
    Clock,
    Trash2,
    FileText,
    Menu,
    Plus,
    BarChart,

} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Use 'any' cast to strictly resolve Framer Motion v10 + React 18 type mismatches.
// This bypasses the 'Property className does not exist' errors.
const MotionDiv = motion.div as any;
const MotionButton = motion.button as any;

export const Sidebar: React.FC = () => {
    const { clearSession, loadSession, currentSessionId } = useChatStore();
    const { user, logout } = useAuthStore();
    const { navigate, currentRoute } = useContext(RouterContext);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Fetch chat sessions on mount
    const fetchSessions = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/chat/sessions', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSessions(data);
            } else if (response.status === 403) {
                // Token expired or invalid
                logout();
            }
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
        }
    };

    useEffect(() => {
        if (user) {
            fetchSessions();
        }
    }, [user, currentSessionId]); // Refresh when session changes

    const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this conversation?')) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/chat/sessions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                setSessions(prev => prev.filter(s => s.id !== id));
                if (currentSessionId === id) {
                    clearSession();
                }
            } else if (response.status === 403) {
                logout();
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const handleSelectSession = async (id: string) => {
        await loadSession(id);
        navigate('chat');
    };

    return (
        <>
            <div
                className={`${isCollapsed ? 'w-[70px]' : 'w-72'} flex-shrink-0 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col h-full transition-all duration-300 ease-in-out shadow-[2px_0_24px_rgba(0,0,0,0.02)] z-10 relative group/sidebar`}
            >
                {/* Toggle Button - (3 Lines / Hamburger) */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-9 z-50 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full p-1.5 shadow-md hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-500 transition-opacity opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    <Menu size={14} />
                </button>

                {/* Header / Logo */}
                <div className={`pt-8 pb-6 border-b border-gray-100 dark:border-zinc-800 flex flex-col items-center ${isCollapsed ? 'px-2' : 'px-4'}`}>
                    <div className="flex flex-col items-center select-none overflow-hidden w-full">
                        {isCollapsed ? (
                            // Icon Logo Mode
                            <div className="w-10 h-10 flex items-center justify-center bg-zinc-900 rounded-lg">
                                <span className="text-white font-black text-xl">S</span>
                            </div>
                        ) : (
                            // Full Logo Mode
                            <div className="w-full text-center">
                                <div className="flex flex-col items-center">
                                    <div className="text-4xl font-black tracking-tight text-[#212b36] dark:text-white flex items-center gap-0.5 leading-none">
                                        <span>SYC</span>
                                        <span className="relative inline-block">
                                            A
                                            <span className="absolute bottom-[13px] left-[8.5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[16px] border-b-[#d32f2f]"></span>
                                        </span>
                                        <span>PT</span>
                                    </div>
                                    <p className="text-[10px] uppercase tracking-[0.45em] font-bold text-[#8a94a2] mt-3">
                                        COMPANY LIMITED
                                    </p>
                                    <p className="text-[11px] font-medium text-[#c4ccd5] mt-1.5 opacity-80">
                                        v1.0
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* User Profile Card (Compact Version) */}
                {!isCollapsed && (
                    <div className="px-4 py-4">
                        <div className="bg-[#f8f9fb] dark:bg-zinc-800/50 p-3 rounded-[20px] border border-gray-100 dark:border-zinc-800 flex items-center gap-3 group/account transition-all duration-300 hover:shadow-sm">
                            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-zinc-100 flex items-center justify-center font-bold text-xs text-[#4caf50]">
                                        {user?.name?.charAt(0) || 'a'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-[#212b36] dark:text-zinc-100 leading-tight truncate">
                                    {user?.name || 'admin'}
                                </h4>
                                <p className="text-[10px] text-[#637381] dark:text-zinc-400 mt-0.5 truncate uppercase tracking-tight font-medium">
                                    {user?.role || 'Developer'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {isCollapsed && (
                    <div className="flex justify-center py-4 px-2">
                        <div className="w-9 h-9 rounded-full bg-[#f8f9fb] border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
                            {user?.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="text-[#4caf50] font-bold text-xs">S</div>
                            )}
                        </div>
                    </div>
                )}

                {/* New Chat Button */}
                <div className={`px-4 mb-2 ${isCollapsed ? 'px-2 flex justify-center' : ''}`}>
                    <MotionButton
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={clearSession}
                        className={`w-full flex items-center justify-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm hover:shadow-md transition-all rounded-lg ${isCollapsed ? 'p-3' : 'py-2.5 px-4'}`}
                        title="New Session"
                    >
                        {isCollapsed ? <Plus size={20} /> : <><RefreshCw className="w-3.5 h-3.5" /> <span className="font-bold text-xs uppercase tracking-wide">New Session</span></>}
                    </MotionButton>
                </div>

                {/* Navigation / History */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-800">

                    {/* Recent Conversations */}
                    {!isCollapsed && (
                        <div className="mb-6">
                            <h3 className="text-[9px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.2em] px-2 mb-3">
                                ACTIVE INTELLIGENCE
                            </h3>

                            <div className="space-y-0.5">
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        onClick={() => handleSelectSession(session.id)}
                                        className={`group relative flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all duration-200 ${currentSessionId === session.id
                                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-300'
                                            }`}
                                    >
                                        <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${currentSessionId === session.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 group-hover:text-zinc-500'}`} />

                                        <span className="text-xs truncate flex-1 leading-none">
                                            {session.title || 'Untitled Session'}
                                        </span>

                                        <button
                                            onClick={(e) => handleDeleteSession(session.id, e)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-red-600 transition-all"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}

                                {sessions.length === 0 && (
                                    <div className="text-center py-4 opacity-50 px-4">
                                        <p className="text-[10px] text-zinc-400">No active sessions</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Core Capabilities (Static Mock) */}
                    {!isCollapsed && (
                        <div className="mb-6">
                            <h3 className="text-[9px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.2em] px-2 mb-3 mt-8">
                                SAVED ANALYSES
                            </h3>
                            <div className="space-y-0.5 opacity-60 pointer-events-none grayscale">
                                <div className="flex items-center gap-3 p-2 text-zinc-500">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span className="text-xs">Security Logs</span>
                                </div>
                                <div className="flex items-center gap-3 p-2 text-zinc-500">
                                    <BarChart className="w-3.5 h-3.5" />
                                    <span className="text-xs">Usage Reports</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className={`p-4 border-t border-gray-100 dark:border-zinc-800 ${isCollapsed ? 'px-2 flex flex-col items-center' : ''}`}>
                    <button
                        onClick={logout}
                        className={`flex items-center gap-3 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors w-full ${isCollapsed ? 'justify-center p-3' : 'px-3 py-2'}`}
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                        {!isCollapsed && <span className="text-xs font-medium">Sign Out</span>}
                    </button>
                </div>
            </div>
            {/* Access Permissions Modal */}
            <AnimatePresence>
                {isProfileOpen && (
                    <MotionDiv
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsProfileOpen(false)}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    >
                        <MotionDiv
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e: { stopPropagation: () => any; }) => e.stopPropagation()}
                            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-zinc-700"
                        >
                            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-start">
                                <div className="flex items-center space-x-4">
                                    <img src={user?.avatarUrl} className="w-16 h-16 rounded-full border-4 border-gray-50 dark:border-zinc-800" alt="Profile" />
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{user?.name}</h3>
                                        <p className="text-sm text-gray-500">{user?.department} • {user?.role}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsProfileOpen(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Authorized Access Scope</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-start space-x-3 text-sm text-gray-600 dark:text-gray-300">
                                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                            <span><strong>ERP Database:</strong> Read-only access to Sales_Q3 tables.</span>
                                        </div>
                                        <div className="flex items-start space-x-3 text-sm text-gray-600 dark:text-gray-300">
                                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                            <span><strong>Vector Store:</strong> Full access to {user?.department} policies.</span>
                                        </div>
                                        <div className="flex items-start space-x-3 text-sm text-gray-600 dark:text-gray-300">
                                            <Lock className="w-5 h-5 text-orange-500 flex-shrink-0" />
                                            <span><strong>Admin Panel:</strong> Restricted. Requires elevation.</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-gray-100 dark:border-zinc-800">
                                    <p className="text-xs text-gray-500 text-center">
                                        Security Context ID: {user?.id} <br />
                                        Session valid until 18:00
                                    </p>
                                </div>
                            </div>
                        </MotionDiv>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </>
    );
};
