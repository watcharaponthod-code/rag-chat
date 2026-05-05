import React from 'react';
import { XCircle } from 'lucide-react';

export const ImagePreviewModal: React.FC<{ src: string; alt?: string; onClose: () => void }> = ({ src, alt, onClose }) => {
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="relative w-full max-w-5xl max-h-[95vh] p-4 flex flex-col items-center">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors z-50 bg-black/20 rounded-full hover:bg-black/40"
                >
                    <XCircle className="w-8 h-8" />
                </button>
                <img
                    src={src}
                    alt="Full Preview"
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                />
                {alt && (
                    <div
                        className="mt-6 bg-zinc-900/90 backdrop-blur text-gray-100 px-6 py-4 rounded-xl max-w-2xl text-center border border-white/10 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-medium leading-relaxed">{alt}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
