import React, { useRef, useEffect, useState } from 'react';
import { useChatStore, useAuthStore } from '@/shared/store/store';
import { ThoughtStep, Message } from '@/shared/style/types';
import {
    Send,
    Paperclip,
    Search,
    BarChart,
    PenTool,
    ShieldCheck,
    ChevronDown,
    ChevronRight,
    GitGraph,
    Square,
    FileText,
    Sparkles,
    Zap,
    Database,
    Settings,
    Bug,
    AlertCircle,
    XCircle,
    Image as ImageIcon,
    Users,
    Check,
    History,
    Brain,
    ListChecks,
    Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// -----------------------------------------------------------------------------
// Typed Wrappers (Fix for Framer Motion v4/React 18+ Type Mismatches)
// Using 'any' as a robust fix because strictly typed HTMLMotionProps are failing
// to intersect correctly with React 18 attributes in this specific environment.
// -----------------------------------------------------------------------------
const MotionDiv = motion.div as any;
const MotionButton = motion.button as any;

import { ThoughtProcess } from './ThoughtProcess';
import { ImagePreviewModal } from './ImagePreviewModal';
import { MessageItem } from './MessageItem';

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Chat Interface
// -----------------------------------------------------------------------------
export const ChatInterface: React.FC = () => {
    const { messages, isThinking, sendMessage, stopGeneration, clients, fetchClients, selectedClient, setSelectedClient, isMediaFullscreen, chatMode, setChatMode } = useChatStore();
    const { user } = useAuthStore();
    const [input, setInput] = useState('');
    const [showClientMenu, setShowClientMenu] = useState(false);
    const [previewItem, setPreviewItem] = useState<{ src: string; alt?: string } | null>(null);

    useEffect(() => {
        fetchClients();
    }, []);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Command Autocomplete State
    const [showCommands, setShowCommands] = useState(false);
    const [commandFilter, setCommandFilter] = useState('');
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
    const backdropRef = useRef<HTMLDivElement>(null);

    // Helper to highlight commands in the backdrop
    const renderBackdrop = (text: string) => {
        const parts = text.split(/(@mantis|@virtuallab|@deepresearch)/gi);
        return parts.map((part, i) => {
            if (part.match(/(@mantis|@virtuallab|@deepresearch)/i)) {
                return <span key={i} className="text-rose-600 dark:text-rose-400 font-bold">{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    const COMMANDS = [
        { id: 'virtuallab', label: '@virtuallab', desc: 'Parallel Deep Research (Code + Bug)', icon: Zap },
        { id: 'mantis', label: '@mantis', desc: 'Search Mantis Issues & Bugs', icon: Bug },

    ];

    const filteredCommands = COMMANDS.filter(c =>
        c.label.toLowerCase().includes('@' + commandFilter.toLowerCase())
    );

    const checkCommandTrigger = (text: string) => {
        const words = text.split(/[\s\n]+/);
        const lastWord = words[words.length - 1];

        if (lastWord.startsWith('@')) {
            setShowCommands(true);
            setCommandFilter(lastWord.slice(1));
            setSelectedCommandIndex(0); // Reset selection
        } else {
            setShowCommands(false);
        }
    };

    const handleCommandSelect = (cmdLabel: string) => {
        const words = input.split(/[\s\n]+/);
        words.pop(); // Remove the partial command
        const newText = words.join(' ') + (words.length > 0 ? ' ' : '') + cmdLabel + ' ';
        setInput(newText);
        setShowCommands(false);
        // Focus back to textarea usually happens automatically as we don't blur, 
        // but ensures cursor is at end
    };

    // Time-based Greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const SUGGESTIONS = [
        { label: 'Deep Research (Virtual Lab)', icon: Zap, cmd: '@virtuallab check architecture and bugs' },
        { label: 'Find open Mantis issues', icon: Bug, cmd: '@mantis status:open' },
    ];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages.length, isThinking]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isThinking) return;
        const text = input;
        setInput('');
        // Pass the smartRewrite toggle value to the backend
        await sendMessage(text, null, { analyzeIntent: false });
    };

    const actionTemplates = ["Analyze Sales Trends", "Summarize Policy", "Draft ETL Script"];

    return (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 relative overflow-hidden">
            {/* Background Pattern & Texture */}
            <div className="absolute inset-0 z-0 bg-dot-pattern opacity-50 pointer-events-none" />

            {/* Lightbox Modal */}
            {previewItem && (
                <ImagePreviewModal src={previewItem.src} alt={previewItem.alt} onClose={() => setPreviewItem(null)} />
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto w-full scroll-smooth scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700 relative z-10 pb-24">
                <div className="max-w-[95%] 2xl:max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-full flex flex-col">

                    {messages.length === 0 ? (
                        /* ZERO STATE: Enterprise Dashboard */
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[600px] relative">
                            <MotionDiv
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className="flex flex-col items-center text-center w-full max-w-4xl relative z-10"
                            >
                                {/* Enterprise Header */}
                                <div className="mb-10 relative select-none">
                                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white mb-3">
                                        SYCAPT <span className="text-brand-600">ENTERPRISE</span>
                                    </h1>
                                    <p className="text-xs font-bold tracking-[0.3em] text-zinc-400 dark:text-zinc-500 uppercase">
                                        Secure Intelligence Platform
                                    </p>
                                </div>

                                {/* Core Capabilities Grid - McKinsey Style */}
                                <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
                                    {/* Card 1 */}
                                    <button className="bg-white dark:bg-zinc-950 p-8 flex flex-col items-start text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group" onClick={() => setInput("Explain the system architecture in detail.")}>
                                        <div className="mb-4 p-2 bg-zinc-100 dark:bg-zinc-900 rounded-md text-zinc-900 dark:text-white group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                            <GitGraph className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1.5">Architecture Intelligence</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">Deep analysis of system components and data flow.</p>
                                    </button>

                                    {/* Card 2 */}
                                    <button className="bg-white dark:bg-zinc-950 p-8 flex flex-col items-start text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group" onClick={() => setInput("Generate API documentation for the endpoint...")}>
                                        <div className="mb-4 p-2 bg-zinc-100 dark:bg-zinc-900 rounded-md text-zinc-900 dark:text-white group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1.5">API & Integration Governance</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">Standardized documentation and contract validaton.</p>
                                    </button>

                                    {/* Card 3 */}
                                    <button className="bg-white dark:bg-zinc-950 p-8 flex flex-col items-start text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group" onClick={() => setInput("Review the following code for security vulnerabilities...")}>
                                        <div className="mb-4 p-2 bg-zinc-100 dark:bg-zinc-900 rounded-md text-zinc-900 dark:text-white group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1.5">Security & Compliance</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">Automated code audits and vulnerability scanning.</p>
                                    </button>

                                    {/* Card 4 */}
                                    <button className="bg-white dark:bg-zinc-950 p-8 flex flex-col items-start text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group" onClick={() => setInput("Analyze the recent performance logs...")}>
                                        <div className="mb-4 p-2 bg-zinc-100 dark:bg-zinc-900 rounded-md text-zinc-900 dark:text-white group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                            <BarChart className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1.5">System Diagnostics</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">Real-time performance monitoring and root cause analysis.</p>
                                    </button>
                                </div>

                            </MotionDiv>
                        </div>
                    ) : (
                        /* MESSAGE LIST */
                        <div className="space-y-8 pb-4">
                            {messages.map((msg, index) => (
                                <MessageItem
                                    key={index}
                                    message={msg}
                                    userAvatar={user?.avatarUrl}
                                    onImageClick={(src, alt) => setPreviewItem({ src, alt })}
                                />
                            ))}
                            <div ref={messagesEndRef} className="h-2" />
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {!isMediaFullscreen && (
                    <MotionDiv
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute bottom-0 left-0 w-full z-20 pt-1 pb-1 px-3 bg-transparent pointer-events-none"
                    >
                        <div className="max-w-3xl mx-auto space-y-1 pointer-events-auto">
                            <AnimatePresence>
                                {/* Old action templates removed from here as they are now in the hero section */}
                            </AnimatePresence>

                            {/* Container for Input + Floating Menus (No Overflow Hidden here) */}
                            <div className="relative z-50">

                                {/* Command Autocomplete Menu (Moved OUTSIDE overflow-hidden) */}
                                <AnimatePresence>
                                    {showCommands && filteredCommands.length > 0 && (
                                        <MotionDiv
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute bottom-full mb-3 left-0 w-64 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-gray-100 dark:border-zinc-700 overflow-hidden z-[100]"
                                        >
                                            <div className="p-1.5 space-y-0.5">
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 dark:border-zinc-700/50 mb-1">
                                                    Available Commands
                                                </div>
                                                {filteredCommands.map((cmd, idx) => (
                                                    <button
                                                        key={cmd.id}
                                                        onClick={() => handleCommandSelect(cmd.label)}
                                                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${idx === selectedCommandIndex
                                                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                                                            : 'hover:bg-gray-50 dark:hover:bg-zinc-700/50 text-gray-700 dark:text-gray-300'
                                                            }`}
                                                    >
                                                        <div className={`p-1.5 rounded-md ${idx === selectedCommandIndex ? 'bg-brand-100 dark:bg-brand-900/40' : 'bg-gray-100 dark:bg-zinc-700'
                                                            }`}>
                                                            <cmd.icon className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold font-mono">{cmd.label}</div>
                                                            <div className="text-[10px] opacity-70 truncate">{cmd.desc}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </MotionDiv>
                                    )}
                                </AnimatePresence>

                                {/* Chat Mode Selector - Outside Input Box */}
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="h-9 rounded-full flex items-center gap-0.5 p-0.5 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 shadow-sm">
                                        {/* Doc Mode */}
                                        <button
                                            onClick={() => setChatMode('doc')}
                                            className={`h-8 px-3 rounded-full flex items-center gap-1.5 transition-all duration-200 ${chatMode === 'doc'
                                                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
                                                }`}
                                            title="Doc - Search documents only"
                                        >
                                            <Zap className="w-3.5 h-3.5" />
                                            <span className="text-xs font-bold">Doc</span>
                                        </button>
                                        {/* Mantis Mode */}
                                        <button
                                            onClick={() => setChatMode('mantis')}
                                            className={`h-8 px-3 rounded-full flex items-center gap-1.5 transition-all duration-200 ${chatMode === 'mantis'
                                                ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
                                                }`}
                                            title="Mantis - Search issues & bugs"
                                        >
                                            <Bug className="w-3.5 h-3.5" />
                                            <span className="text-xs font-bold">Mantis</span>
                                        </button>
                                        {/* Agent Mode */}
                                        <button
                                            onClick={() => setChatMode('agent')}
                                            className={`h-8 px-3 rounded-full flex items-center gap-1.5 transition-all duration-200 ${chatMode === 'agent'
                                                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
                                                }`}
                                            title="Agent - Intelligent (Doc + Mantis)"
                                        >
                                            <Brain className="w-3.5 h-3.5" />
                                            <span className="text-xs font-bold">Agent</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Input Container Wrapper for Animated Border (Has Overflow Hidden) */}
                                <div className="relative group rounded-3xl overflow-hidden p-[1.5px] transition-all duration-300 shadow-sm focus-within:shadow-brand-500/20 focus-within:shadow-lg">

                                    {/* The Spinning Red Gradient Beam (Visible on Focus, Spins on Thinking) */}
                                    {/* Static on focus, Spins when AI is generating (isThinking) */}
                                    <div className={`absolute inset-[-200%] bg-[conic-gradient(from_90deg_at_50%_50%,#9f1239_0%,#f43f5e_50%,#9f1239_100%)] ${isThinking ? 'animate-[spin_3s_linear_infinite]' : ''} opacity-0 ${isThinking ? 'opacity-100' : 'group-focus-within:opacity-100'} transition-opacity duration-500 will-change-transform`} />

                                    {/* Main Input Box (Sits on top of the beam) */}
                                    <div className={`relative flex items-end gap-2 p-1 rounded-[22px] w-full h-full transition-all duration-300 ${isThinking
                                        ? 'bg-white dark:bg-zinc-950'
                                        : 'bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md group-focus-within:bg-white dark:group-focus-within:bg-zinc-950'
                                        }`}>

                                        {/* Left Side: Client Filter Button */}
                                        <div className="relative flex-shrink-0 mb-[1px]">
                                            <button
                                                onClick={() => setShowClientMenu(!showClientMenu)}
                                                className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 transition-all duration-200 border ${selectedClient
                                                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-800'
                                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-zinc-700'
                                                    }`}
                                                title="Filter by Client"
                                            >
                                                {selectedClient ? (
                                                    <div className="flex items-center gap-1.5 max-w-[100px]">
                                                        <span className="text-xs font-bold truncate">{selectedClient}</span>
                                                    </div>
                                                ) : (
                                                    <Users className="w-4 h-4" />
                                                )}
                                                <ChevronDown className={`w-3 h-3 transition-transform ${showClientMenu ? 'rotate-180' : ''}`} />
                                            </button>

                                            {/* Client Dropdown Menu */}
                                            <AnimatePresence>
                                                {showClientMenu && (
                                                    <MotionDiv
                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        className="absolute bottom-full mb-2 left-0 w-48 max-h-60 overflow-y-auto bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-700 z-[120] scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700"
                                                    >
                                                        <div className="p-1.5 space-y-0.5">
                                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 dark:border-zinc-700/50 mb-1 flex justify-between items-center">
                                                                <span>Select Client</span>
                                                                {selectedClient && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedClient(null);
                                                                            setShowClientMenu(false);
                                                                        }}
                                                                        className="text-xs text-rose-500 hover:text-rose-600 font-bold"
                                                                    >
                                                                        Clear
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {clients.length === 0 && (
                                                                <div className="px-3 py-2 text-xs text-gray-400 italic text-center">No clients found</div>
                                                            )}

                                                            {clients.map((client) => (
                                                                <button
                                                                    key={client}
                                                                    onClick={() => {
                                                                        setSelectedClient(client);
                                                                        setShowClientMenu(false);
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${selectedClient === client
                                                                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-bold'
                                                                        : 'hover:bg-gray-50 dark:hover:bg-zinc-700/50 text-gray-700 dark:text-gray-300'
                                                                        }`}
                                                                >
                                                                    <span className="text-xs truncate">{client}</span>
                                                                    {selectedClient === client && <Check className="w-3.5 h-3.5" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </MotionDiv>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Input Wrapper */}
                                        <div className="relative w-full">
                                            <textarea
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value);
                                                    checkCommandTrigger(e.target.value);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (showCommands && filteredCommands.length > 0) {
                                                        if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            setSelectedCommandIndex(prev => Math.max(0, prev - 1));
                                                            return;
                                                        }
                                                        if (e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            setSelectedCommandIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
                                                            return;
                                                        }
                                                        if (e.key === 'Enter' || e.key === 'Tab') {
                                                            e.preventDefault();
                                                            handleCommandSelect(filteredCommands[selectedCommandIndex].label);
                                                            return;
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setShowCommands(false);
                                                            return;
                                                        }
                                                    }

                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSend();
                                                    }
                                                }}
                                                placeholder={isThinking ? "Thinking..." : "Message (Use '@' to trigger commands)"}
                                                className={`w-full max-h-[150px] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 ring-0 resize-none py-1.5 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent`}
                                                rows={1}
                                                style={{ minHeight: '24px', lineHeight: '17px' }}
                                            />
                                        </div>
                                        <MotionButton
                                            whileTap={{ scale: 0.95 }}
                                            onClick={isThinking ? stopGeneration : handleSend}
                                            disabled={!input.trim() && !isThinking}
                                            className={`h-8 w-8 mb-[1px] shrink-0 rounded-full flex items-center justify-center transition-all duration-200 ${(input.trim() || isThinking)
                                                ? 'bg-brand-600 text-white shadow-md hover:bg-brand-700 hover:shadow-lg'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
                                                }`}
                                        >
                                            {isThinking ? <Square className="w-4 h-4 fill-current" /> : <Send className="w-4 h-4 fill-current ml-0.5" />}
                                        </MotionButton>
                                    </div>
                                </div>
                            </div>
                            <div className="text-center pt-1">
                                <p className="text-[9px] text-gray-300 dark:text-zinc-700 font-medium tracking-wide">AI GENERATED • ENTERPRISE DATA PROCESSED SECURELY</p>
                            </div>
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </div>
    );
};
