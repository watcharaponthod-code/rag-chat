import React, { useState, useEffect, useRef } from 'react';
import { ThoughtStep } from '@/shared/style/types';
import { Search, BarChart, PenTool, ShieldCheck, ChevronDown, GitGraph, Zap, History, Brain, ListChecks, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MotionDiv = motion.div as any;

export const ThoughtProcess: React.FC<{ thoughts: ThoughtStep[]; isStreaming?: boolean }> = ({ thoughts, isStreaming }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isExpanded && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [thoughts, isExpanded]);

    if (!thoughts || thoughts.length === 0) return null;

    const activeStepObj = thoughts.find(t => t.status === 'active');
    const lastStep = thoughts[thoughts.length - 1];

    const isReasoningFinished = thoughts.some(t => t.id === 'ai-reasoning-stream' && t.status === 'completed');
    const isActiveState = !!activeStepObj || (isStreaming && !isReasoningFinished);

    const displayStep = activeStepObj || lastStep;

    const getIcon = (icon: string, className: string) => {
        switch (icon) {
            case 'search': return <Search className={className} />;
            case 'process': return <BarChart className={className} />;
            case 'write': return <PenTool className={className} />;
            case 'secure': return <ShieldCheck className={className} />;
            case 'history': return <History className={className} />;
            case 'brain': return <Brain className={className} />;
            case 'list-check': return <ListChecks className={className} />;
            case 'filter': return <Filter className={className} />;
            case 'zap': return <Zap className={className} />;
            default: return <GitGraph className={className} />;
        }
    };

    return (
        <MotionDiv
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 w-full max-w-2xl font-sans"
        >
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`group relative flex items-center gap-2 w-full p-1.5 rounded-xl transition-all duration-300 border ${isExpanded
                    ? 'bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border-gray-200/60 dark:border-zinc-700/60 shadow-sm'
                    : 'hover:bg-white/50 dark:hover:bg-zinc-800/30 border-transparent hover:border-gray-200/30 dark:hover:border-zinc-700/30 opacity-60 hover:opacity-100'
                    }`}
            >
                <div className={`relative p-1.5 rounded-lg flex-shrink-0 transition-all duration-500 ${isActiveState
                    ? 'bg-gradient-to-br from-brand-50 to-brand-100/50 dark:from-brand-500/20 dark:to-brand-900/10 text-brand-600 dark:text-brand-400'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                    }`}>
                    {isActiveState ? (
                        <Zap className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                        <GitGraph className="w-3.5 h-3.5" />
                    )}
                </div>

                <div className="flex flex-col items-start min-w-0 flex-1 gap-0.5">
                    <div className="flex items-center gap-2 w-full">
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                            System Analysis
                        </span>
                    </div>

                    {!isExpanded && displayStep && (
                        <span className="text-[9px] text-gray-400 dark:text-zinc-500 truncate w-full text-left font-medium flex items-center gap-1.5 opacity-80">
                            {displayStep.id === 'ai-reasoning-stream' || (isStreaming && !isReasoningFinished && displayStep.id !== 'ai-reasoning-stream') ? (
                                <>
                                    <span className="text-brand-600 dark:text-brand-500 font-bold animate-pulse">Processing Data:</span>
                                    <span className="font-mono text-[9px] opacity-70 tracking-tight">
                                        {displayStep.id === 'ai-reasoning-stream' && displayStep.description
                                            ? displayStep.description.slice(-80).replace(/\n/g, ' ')
                                            : 'Preparing reasoning engine...'
                                        }
                                    </span>
                                </>
                            ) : (
                                <span className="tracking-tight">{displayStep.description}</span>
                            )}
                        </span>
                    )}
                </div>

                <div className={`mr-1 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4" />
                </div>
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <MotionDiv
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="relative mt-3 mx-1 bg-white/40 dark:bg-zinc-900/40 rounded-2xl border border-gray-100 dark:border-zinc-800/50 backdrop-blur-sm p-4 shadow-inner">
                            <div className="absolute left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-gray-200 dark:via-zinc-700 to-transparent dashed opacity-50" />

                            <div
                                ref={scrollRef}
                                className="space-y-6 relative max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700 pr-2 pb-2 pl-1"
                            >
                                {thoughts.map((step, idx) => {
                                    const isThinkingStream = step.id === 'ai-reasoning-stream';
                                    const isActive = step.status === 'active';
                                    const isCompleted = step.status === 'completed';

                                    return (
                                        <MotionDiv
                                            key={step.id}
                                            initial={{ x: -10, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className={`relative flex gap-4 ${isThinkingStream ? 'mt-2' : ''}`}
                                        >
                                            <div className="relative z-10 flex-shrink-0 mt-0.5">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-500 ${isCompleted
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                                                    : isActive
                                                        ? 'bg-white dark:bg-zinc-800 border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-400 shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]'
                                                        : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-300 dark:text-zinc-600'
                                                    }`}>
                                                    {getIcon(step.icon, isActive ? "w-3 h-3 animate-pulse" : "w-3 h-3")}
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0 pt-0.5">
                                                {isThinkingStream ? (
                                                    <div className="group relative overflow-hidden rounded-xl bg-gray-50/80 dark:bg-black/40 border border-gray-200/80 dark:border-zinc-800 p-4 transition-all hover:border-brand-200 dark:hover:border-brand-900/50">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800/50 text-[9px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest">
                                                                <Brain className="w-3 h-3" />
                                                                Reasoning Engine
                                                            </span>
                                                            {isActive && <span className="flex h-2 w-2 relative ml-auto">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                                                            </span>}
                                                        </div>

                                                        <div className="text-[11px] font-mono leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap opacity-90 pl-1 border-l-2 border-brand-200 dark:border-brand-900/50">
                                                            {step.description || <span className="animate-pulse text-gray-400">Analysis initialized...</span>}
                                                        </div>
                                                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/10 dark:to-black/10 pointer-events-none" />
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className={`text-xs font-medium leading-relaxed transition-colors duration-300 ${isCompleted ? 'text-gray-500 dark:text-gray-400' :
                                                            isActive ? 'text-gray-900 dark:text-gray-100 scale-[1.01] origin-left' :
                                                                'text-gray-400 dark:text-zinc-600'
                                                            }`}>
                                                            {step.description}
                                                        </span>
                                                        {idx === thoughts.length - 1 && isActive && !isThinkingStream && (
                                                            <span className="text-[10px] text-brand-500 animate-pulse font-medium">Processing...</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </MotionDiv>
                                    )
                                })}
                            </div>
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </MotionDiv>
    );
};
