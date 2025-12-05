'use client';

import { useState, ReactNode } from 'react';

interface ImageModalProps {
    src: string;
    timestamp: string;
    activity: {
        mouseClicks: number;
        keyPresses: number;
        mouseMoves: number;
    };
    children: ReactNode;
}

export default function ImageModal({ src, timestamp, activity, children }: ImageModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <div onClick={() => setIsOpen(true)}>
                {children}
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setIsOpen(false)}>
                    <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <img
                            src={src}
                            alt="Full Screen"
                            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                        />

                        <div className="mt-4 bg-white dark:bg-gray-800 px-6 py-3 rounded-full flex items-center gap-6 shadow-lg">
                            <div className="text-lg font-bold text-gray-800 dark:text-white">{timestamp}</div>
                            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
                            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
                                <span>⌨️ {activity.keyPresses} Keys</span>
                                <span>🖱️ {activity.mouseClicks} Clicks</span>
                                <span>✋ {activity.mouseMoves} Moves</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 text-4xl font-light"
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
