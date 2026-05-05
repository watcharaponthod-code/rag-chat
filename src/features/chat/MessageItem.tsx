import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, FileText, Zap, Sparkles, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Message } from '@/shared/style/types';

import { ThoughtProcess } from './ThoughtProcess';

const MotionDiv = motion.div as any;

function splitMarkdownTableCells(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
}

function escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function fitCellsToHeader(cells: string[], expectedCount: number): string[] {
    if (cells.length === expectedCount) return cells;
    if (cells.length > expectedCount) {
        const stable = cells.slice(0, expectedCount - 1);
        stable.push(cells.slice(expectedCount - 1).join(' - '));
        return stable;
    }
    return [...cells, ...Array.from({ length: expectedCount - cells.length }, () => '')];
}

function tryParseBulletRow(line: string, expectedCols: number): string[] | null {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (!bulletMatch) return null;

    const payload = bulletMatch[1].trim();
    if (!/^\d{3,8}\s+-\s+/.test(payload)) return null;

    const parts = payload.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
    if (parts.length < expectedCols) return null;

    if (expectedCols === 5 && parts.length >= 5) {
        const refId = parts[0];
        const summary = parts[parts.length - 1];
        const updatedAt = parts[parts.length - 2];
        const status = parts[parts.length - 3];
        const projectName = parts.slice(1, parts.length - 3).join(' - ');

        if (!projectName || !/\d{4}-\d{2}-\d{2}/.test(updatedAt)) return null;
        return [refId, projectName, status, updatedAt, summary];
    }

    return fitCellsToHeader(parts, expectedCols);
}

function normalizeMarkdownTables(content: string): string {
    const lines = content.split('\n');
    const out: string[] = [];

    let i = 0;
    while (i < lines.length) {
        const header = lines[i] || '';
        const delimiter = lines[i + 1] || '';
        const isTableHeader = header.includes('|');
        const isTableDelimiter = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(delimiter);

        if (!isTableHeader || !isTableDelimiter) {
            out.push(header);
            i += 1;
            continue;
        }

        const headerCells = splitMarkdownTableCells(header);
        const rowLines: string[] = [];
        const rowCells: string[][] = [];

        let j = i + 2;
        while (j < lines.length) {
            const row = lines[j];
            if (!row.trim()) break;

            const bulletCells = tryParseBulletRow(row, headerCells.length);
            const isPipeRow = row.includes('|');

            if (!isPipeRow && !bulletCells) break;

            const normalizedCells = fitCellsToHeader(
                bulletCells || splitMarkdownTableCells(row),
                headerCells.length
            );

            rowCells.push(normalizedCells);
            rowLines.push(`| ${normalizedCells.map(escapeMarkdownCell).join(' | ')} |`);
            j += 1;
        }

        const allRowsAreTwoCols = rowCells.length > 0 && rowCells.every(cells => cells.length === 2);
        if (headerCells.length === 3 && allRowsAreTwoCols) {
            const mergedHeader = `${headerCells[0]} / ${headerCells[1]}`.replace(/\s{2,}/g, ' ').trim();
            out.push(`| ${mergedHeader} | ${headerCells[2]} |`);
            out.push('| --- | --- |');
            rowCells.forEach(cells => {
                out.push(`| ${cells[0]} | ${cells[1]} |`);
            });
        } else {
            out.push(header);
            out.push(delimiter);
            rowLines.forEach(row => out.push(row));
        }

        i = j;
    }

    return out.join('\n');
}

const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 text-[10px] font-medium text-zinc-400 transition-all active:scale-95 cursor-pointer"
            aria-label="Copy code to clipboard"
        >
            {copied ? (
                <span className="text-green-400 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Copied!
                </span>
            ) : (
                <span className="hover:text-white flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                    Copy
                </span>
            )}
        </button>
    );
};

export const MessageItem: React.FC<{ message: Message; userAvatar?: string; onImageClick: (src: string, alt: string) => void }> = React.memo(({ message, userAvatar, onImageClick }) => {
    const isUser = message.role === 'user';
    const plugins = React.useMemo(() => [remarkGfm], []);
    const [showAllImages, setShowAllImages] = useState(false);
    const [isVisualsExpanded, setIsVisualsExpanded] = useState(true);

    // Filter Citations Logic
    const usedCitations = React.useMemo(() => {
        if (!message.citations || !message.content || !Array.isArray(message.citations)) return [];

        const uniqueMap = new Map();

        message.citations.forEach(c => {
            let key = c.title || c.url;
            let displayTitle = c.title;
            let issueId = '';

            if (c.title.includes('Mantis Issue')) {
                const idMatch = c.title.match(/#(\d+)/);
                if (idMatch) issueId = idMatch[1];

                const projectMatch = c.title.match(/\((.*?)\)/);
                if (projectMatch && projectMatch[1]) {
                    const projectName = projectMatch[1];
                    key = `Mantis-Group-${projectName}`;
                    displayTitle = `Mantis (${projectName})`;
                }
            }

            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, { ...c, title: displayTitle, relatedIds: issueId ? [issueId] : [] });
            } else {
                const existing = uniqueMap.get(key);
                if (issueId && existing && !existing.relatedIds.includes(issueId)) {
                    existing.relatedIds.push(issueId);
                }
            }
        });

        const uniqueList = Array.from(uniqueMap.values());

        const explicitCitations = Array.from(uniqueMap.values()).filter(c => {
            const title = c.title.trim();

            if (message.content.includes(`[Source: ${title}]`) || message.content.includes(`[[Source: ${title}]]`)) return true;
            if (message.content.includes(`[Source: ${title.split('.')[0]}]`) || message.content.includes(`[[Source: ${title.split('.')[0]}]]`)) return true;
            if (message.content.includes(`[[${title}]]`) || message.content.includes(`[${title}]`)) return true;
            if (message.content.includes(`(เอกสาร: ${title})`) || message.content.includes(`เอกสาร: ${title}`)) return true;
            if (message.content.includes(`(Source: ${title})`) || message.content.includes(`Source: ${title}`)) return true;

            if (title.includes('Mantis')) {
                const ids = (c as any).relatedIds || [];
                if (ids.some((id: string) => message.content.includes(id))) return true;
            }

            if (title.length > 15 && message.content.includes(title)) return true;

            return false;
        });

        return explicitCitations;

    }, [message.citations, message.content]);

    // Filter Images Logic
    const displayedImages = React.useMemo(() => {
        if (!message.relatedImages || message.relatedImages.length === 0) return [];

        const mentionedIndices = new Set<number>();
        const matches = message.content.matchAll(/Figure\s*(\d+)/g);
        for (const match of matches) {
            mentionedIndices.add(parseInt(match[1]));
        }

        const usedImages = message.relatedImages.filter((img: any) =>
            mentionedIndices.has(img.refIndex)
        );

        return usedImages;
    }, [message.relatedImages, message.content]);

    const showVisualsPanel = displayedImages.length > 0 && !isUser;
    const hasImages = showVisualsPanel;

    const processedContent = React.useMemo(() => {
        let content = message.content
            .replace(/\[\[.*?\]\]/g, '')
            .replace(/\[Source:.*?\]/g, '')
            .replace(/\\\\n/g, '\n')
            .replace(/\[Figure\s*(\d+)\]/g, '[Figure $1](#figure-$1)');

        content = content.replace(/\(<<IMG_IDX_(\d+)>>\)/g, (match, id) => {
            const idx = parseInt(id, 10);
            const img = message.relatedImages?.find((i: any) => i.refIndex === idx);
            return img ? `\n\n![${img.description || 'Image'}](${img.url})\n\n` : match;
        });

        return normalizeMarkdownTables(content);
    }, [message.content, message.relatedImages]);

    const remarkFigurePlugin = React.useMemo(() => {
        return () => (tree: any) => {
            const visit = (node: any) => {
                if (node.children) {
                    const newChildren: any[] = [];
                    node.children.forEach((child: any) => {
                        if (child.type === 'text' && /\[Figure \d+\]/.test(child.value)) {
                            const regex = /\[Figure (\d+)\]/g;
                            let lastIndex = 0;
                            let match;
                            while ((match = regex.exec(child.value)) !== null) {
                                const idx = match.index;
                                if (idx > lastIndex) {
                                    newChildren.push({ type: 'text', value: child.value.slice(lastIndex, idx) });
                                }
                                const figNum = match[1];
                                newChildren.push({
                                    type: 'link',
                                    url: `#figure-${figNum}`,
                                    title: `View Figure ${figNum}`,
                                    children: [{ type: 'text', value: `Figure ${figNum}` }]
                                });
                                lastIndex = idx + match[0].length;
                            }
                            if (lastIndex < child.value.length) {
                                newChildren.push({ type: 'text', value: child.value.slice(lastIndex) });
                            }
                        } else {
                            visit(child);
                            newChildren.push(child);
                        }
                    });
                    node.children = newChildren;
                }
            };
            visit(tree);
        };
    }, []);

    const markdownComponents = React.useMemo(() => ({
        code({ node, inline, className, children, ...props }: any) {
            const childrenArray = React.Children.toArray(children);
            let codeString = childrenArray
                .map(child => (typeof child === 'string' ? child : ''))
                .join('');

            codeString = codeString
                .replace(/\\n/g, '\n')
                .replace(/\\\\n/g, '\n')
                .replace(/\n$/, '');

            const isMultiLine = codeString.includes('\n');
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';



            if (inline || !isMultiLine) {
                const cleanedContent = codeString.replace(/<br\s*\/?>/gi, '\n').replace(/&lt;br\s*\/?&gt;/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                return (
                    <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-brand-600 dark:text-brand-300 font-mono text-[13px] border border-zinc-200 dark:border-zinc-700 align-middle tracking-tight break-words whitespace-pre-wrap" {...props}>{cleanedContent}</code>
                );
            }

            return (
                <div className="my-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900 overflow-hidden shadow-sm group hover:border-brand-200 dark:hover:border-brand-900/40 transition-colors duration-300">
                    <div className="flex justify-between items-center px-4 py-2 bg-zinc-100/50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-widest">{language || 'TEXT'}</span>
                        <CopyButton text={String(children).replace(/\n$/, '')} />
                    </div>
                    <div className="p-4 overflow-x-auto">
                        <pre className="!p-0 !m-0 !bg-transparent !text-inherit font-mono text-xs sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-50">
                            <code className="!text-inherit !p-0 !bg-transparent" {...props}>{children}</code>
                        </pre>
                    </div>
                </div>
            );
        },
        pre: ({ node, children, ...props }: any) => <div className="not-prose my-4" {...props}>{children}</div>,
        table({ node, children, ...props }: any) {
            return (
                <div className="overflow-x-auto my-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/40 w-full">
                    <table className="w-full min-w-[720px] text-left border-collapse text-sm table-auto" {...props}>{children}</table>
                </div>
            );
        },
        thead: ({ node, children, ...props }: any) => <thead className="bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700" {...props}>{children}</thead>,
        tbody: ({ node, children, ...props }: any) => <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60" {...props}>{children}</tbody>,
        tr: ({ node, children, ...props }: any) => <tr className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0" {...props}>{children}</tr>,
        th: ({ node, children, ...props }: any) => (
            <th className="px-6 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider whitespace-nowrap first:pl-6" {...props}>{children}</th>
        ),
        td: ({ node, children, ...props }: any) => {
            const processedChildren = React.Children.map(children, child => {
                if (typeof child === 'string') {
                    return child.split(/(?:<br\s*\/?>|&lt;br\s*\/?&gt;|\\n)/gi).map((text, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <br />}
                            {text}
                        </React.Fragment>
                    ));
                }
                return child;
            });
            return (
                <td className="px-6 py-3 text-zinc-600 dark:text-zinc-300 align-top leading-relaxed min-w-[140px] first:pl-6 whitespace-pre-wrap break-words" {...props}>
                    {processedChildren}
                </td>
            );
        },
        h1: ({ node, ...props }: any) => <h1 className="text-4xl sm:text-5xl font-black text-zinc-900 dark:text-white mt-16 mb-8 tracking-tighter leading-tight flex items-start gap-4" {...props}>{props.children}</h1>,
        h2: ({ node, ...props }: any) => (
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white mt-14 mb-6 pb-2 border-b border-zinc-200 dark:border-zinc-800 uppercase tracking-widest relative" {...props}>
                <span className="absolute -left-4 top-1 w-1 h-5 bg-brand-600"></span>
                {props.children}
            </h2>
        ),
        h3: ({ node, ...props }: any) => <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mt-10 mb-4 tracking-tight" {...props} />,
        h4: ({ node, ...props }: any) => <h4 className="text-base font-bold text-gray-700 dark:text-gray-200 mt-4 mb-2 uppercase tracking-wide border-l-2 border-zinc-200 dark:border-zinc-700 pl-3" {...props} />,
        p: ({ node, ...props }: any) => <p className="mb-4 text-base leading-7 text-gray-600 dark:text-zinc-300 tracking-normal" {...props} />,
        ul: ({ node, ...props }: any) => <ul className="list-disc list-outside ml-6 mb-6 space-y-2 text-zinc-700 dark:text-zinc-300 marker:text-zinc-400 dark:marker:text-zinc-600 [&_p]:indent-0" {...props} />,
        ol: ({ node, ...props }: any) => <ol className="list-decimal list-outside ml-16 mb-4 space-y-2 text-gray-600 dark:text-zinc-300 marker:text-brand-500 dark:marker:text-brand-400 marker:font-bold [&_p]:indent-0" {...props} />,
        a: ({ node, ...props }: any) => {
            if (props.href?.startsWith('#figure-')) {
                const index = parseInt(props.href.replace('#figure-', ''), 10);
                const img = message.relatedImages?.find((i: any) => i.refIndex === index);

                if (img) {
                    return (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                setIsVisualsExpanded(true);
                                setTimeout(() => {
                                    const el = document.getElementById(`visual-${message.id || 'msg'}-${img.refIndex}`);
                                    if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        el.classList.add('ring-2', 'ring-brand-500');
                                        setTimeout(() => el.classList.remove('ring-2', 'ring-brand-500'), 2000);
                                    }
                                }, 300);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 mx-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-200 dark:hover:border-brand-800 transition-all shadow-sm select-none"
                            title={img.description}
                        >
                            <ImageIcon className="w-3.5 h-3.5 text-brand-500/70 group-hover:text-brand-500" />
                            {props.children}
                        </button>
                    );
                }
            }

            if (props.href === '#source-citation') {
                const sourceName = String(props.children).replace(/^Source:\s*/, '');
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 rounded-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 select-none align-middle tracking-tight group hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-help" title={`Source: ${sourceName}`}>
                        <FileText className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
                        <span className="max-w-[120px] truncate">{sourceName}</span>
                    </span>
                );
            }

            return (
                <a className="text-brand-600 dark:text-brand-400 font-medium hover:text-brand-800 dark:hover:text-brand-300 underline decoration-brand-200 dark:decoration-brand-800/50 underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
            );
        },
        blockquote: ({ node, children, ...props }: any) => (
            <blockquote className="my-8 pl-6 border-l-4 border-brand-600 bg-gray-50 dark:bg-zinc-800/30 py-4 pr-4 rounded-r-sm italic text-zinc-700 dark:text-zinc-300 shadow-sm" {...props}>{children}</blockquote>
        ),
        strong: ({ node, ...props }: any) => <strong className="font-bold text-zinc-900 dark:text-zinc-100" {...props} />,
        img: ({ node, ...props }: any) => (
            <span className="flex flex-col items-center my-6 w-full">
                <span
                    className="relative block group rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 cursor-zoom-in transition-transform duration-300 hover:scale-[1.01] w-full max-w-md"
                    onClick={() => onImageClick && onImageClick(props.src, props.alt)}
                >
                    <img
                        className="w-full h-auto object-contain max-h-[350px]"
                        {...props}
                        loading="lazy"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                </span>
                {props.alt && (
                    <span className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 font-medium text-center max-w-lg px-4 block">
                        {props.alt.replace(/^Figure \d+:/, '').trim()}
                    </span>
                )}
            </span>
        ),
    }), [message.relatedImages, message.id]);

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`w-full max-w-[95%] xl:max-w-[90%] flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-4 sm:gap-6`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm overflow-hidden ${isUser
                    ? 'bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700'
                    : 'bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-brand-500/20 shadow-lg'
                    }`}>
                    {isUser && userAvatar ? (
                        <img src={userAvatar} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        isUser ? 'U' : 'AI'
                    )}
                </div>

                {/* Layout Container */}
                <div className={`flex-1 min-w-0 flex flex-col md:flex-row gap-4 sm:gap-6`}>
                    {/* LEFT COLUMN: Text Content */}
                    <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : 'text-left'}`}>
                        {!isUser && message.thoughts && <ThoughtProcess thoughts={message.thoughts} isStreaming={message.isStreaming} />}
                        <div className={`${isUser ? 'prose prose-sm sm:prose-base dark:prose-invert max-w-none' : 'max-w-none'} transition-all ${isUser
                            ? 'bg-white dark:bg-zinc-800 p-4 sm:p-5 rounded-2xl rounded-tr-none shadow-sm border border-gray-100 dark:border-zinc-700 text-gray-800 dark:text-gray-100 inline-block text-left'
                            : 'text-gray-900 dark:text-gray-100 w-full'
                            }`} style={{ width: isUser ? 'fit-content' : '100%' }}>

                            {isUser ? (
                                message.content
                            ) : (
                                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkFigurePlugin]}
                                        components={markdownComponents}
                                    >
                                        {processedContent}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {message.isStreaming && (
                                <div className="inline-flex items-center gap-1 ml-2 align-middle translate-y-1">
                                    <span className="w-1.5 h-4 bg-brand-400 rounded-full animate-[pulse_1s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-1.5 h-6 bg-brand-500 rounded-full animate-[pulse_1s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-1.5 h-3 bg-brand-600 rounded-full animate-[pulse_1s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }}></span>
                                </div>
                            )}
                        </div>

                        {/* Citations */}
                        {!message.isStreaming && !isUser && usedCitations && usedCitations.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-zinc-800 animate-in fade-in duration-500">
                                <h4 className="text-[10px] font-bold text-brand-600 dark:text-brand-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    แหล่งอ้างอิง
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {usedCitations.map((c, idx) => {
                                        const isMantis = c.title.includes('Mantis');
                                        const displayTitle = isMantis ? c.title : c.title;

                                        return (
                                            <div
                                                key={c.id || idx}
                                                className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 cursor-default max-w-[240px] ${isMantis
                                                    ? 'bg-brand-50 dark:bg-brand-900/10 border-brand-100 dark:border-brand-900/30'
                                                    : 'bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-800'
                                                    }`}
                                                title={c.title}
                                            >
                                                <div className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors ${isMantis
                                                    ? 'bg-white dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 text-brand-500'
                                                    : 'bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-gray-400 dark:text-gray-500'
                                                    }`}>
                                                    {isMantis ? <Zap className="w-3.5 h-3.5 fill-current" /> : <FileText className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <span className={`text-[11px] font-semibold truncate leading-tight transition-colors ${isMantis ? 'text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        {displayTitle}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Knowledge Panel */}
                    {hasImages && !isUser && (
                        <MotionDiv
                            layout
                            initial={false}
                            animate={{ width: isVisualsExpanded ? 300 : 40 }}
                            className="flex-shrink-0 sticky top-6 self-start flex flex-col gap-4 transition-all duration-500 ease-[0.2,0,0,1]"
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {isVisualsExpanded ? (
                                    <MotionDiv
                                        key="expanded"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="w-full flex flex-col gap-3"
                                    >
                                        <button
                                            onClick={() => setIsVisualsExpanded(false)}
                                            className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-zinc-800 w-full hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-lg px-2 transition-colors group/header select-none"
                                        >
                                            <Sparkles className="w-4 h-4 text-brand-500" />
                                            <span className="text-xs font-bold text-brand-600 dark:text-brand-500 uppercase tracking-widest whitespace-nowrap">Visuals</span>
                                            <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full flex items-center gap-1 group-hover/header:bg-white dark:group-hover/header:bg-zinc-700 transition-colors">
                                                {message.relatedImages!.length}
                                                <ChevronRight className="w-3 h-3" />
                                            </span>
                                        </button>

                                        <div className="space-y-3 pl-1 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-800">
                                            {displayedImages!.map((img, idx) => {
                                                const [title, desc] = img.description.includes('|')
                                                    ? img.description.split('|').map((s: string) => s.trim())
                                                    : [img.description, ''];

                                                return (
                                                    <div
                                                        key={idx}
                                                        id={`visual-${message.id || 'msg'}-${(img as any).refIndex}`}
                                                        className="group relative flex flex-row bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer h-24 shrink-0"
                                                        onClick={() => onImageClick(img.url, img.description)}
                                                    >
                                                        <div className="w-[100px] min-w-[100px] h-full relative bg-gray-100 dark:bg-zinc-800">
                                                            <div className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-10 shadow-sm border border-white/10">
                                                                {(img as any).refIndex || idx + 1}
                                                            </div>
                                                            <img src={img.url} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
                                                        </div>
                                                        <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                                                            <h5 className="text-[10px] font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight mb-0.5" title={title}>{title}</h5>
                                                            <p className="text-[9px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{desc}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </MotionDiv>
                                ) : (
                                    <MotionDiv
                                        key="collapsed"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col items-center gap-3 w-full"
                                    >
                                        <button
                                            onClick={() => setIsVisualsExpanded(true)}
                                            className="w-10 h-10 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-200 dark:hover:border-brand-800 shadow-sm transition-all group"
                                            title="Expand Visuals"
                                        >
                                            <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                        </button>
                                    </MotionDiv>
                                )}
                            </AnimatePresence>
                        </MotionDiv>
                    )}

                </div>
            </div>
        </div>
    );
});
