"use client";

import { useState, useTransition } from "react";
import { updateManualEarnings } from "../actions";

interface EarningsEditorProps {
    userId: string;
    initialData: {
        weeklyPaid: number;
        weeklyPending: number;
        totalPending: number;
    };
}

export default function EarningsEditor({ userId, initialData }: EarningsEditorProps) {
    const [data, setData] = useState(initialData);
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setData({
            ...data,
            [e.target.name]: parseFloat(e.target.value) || 0,
        });
    };

    const handleSave = () => {
        startTransition(async () => {
            await updateManualEarnings(userId, data);
            setIsOpen(false);
        });
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-[#2a2a2a] hover:bg-[#333] text-gray-300 px-3 py-1 rounded border border-[#333] text-xs font-medium transition-colors"
            >
                Edit Earnings
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                    <div className="bg-[#1e1e1e] border border-[#333] rounded-lg p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-white text-lg font-bold mb-4">Edit Manual Earnings</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Weekly Paid ($)</label>
                                <input
                                    type="number"
                                    name="weeklyPaid"
                                    value={data.weeklyPaid}
                                    onChange={handleChange}
                                    className="w-full bg-[#2a2a2a] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#14a800]"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Weekly Pending ($)</label>
                                <input
                                    type="number"
                                    name="weeklyPending"
                                    value={data.weeklyPending}
                                    onChange={handleChange}
                                    className="w-full bg-[#2a2a2a] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#14a800]"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Total All-Time Pending ($)</label>
                                <input
                                    type="number"
                                    name="totalPending"
                                    value={data.totalPending}
                                    onChange={handleChange}
                                    className="w-full bg-[#2a2a2a] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#14a800]"
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-2 text-gray-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="px-4 py-2 bg-[#14a800] hover:bg-[#108a00] text-white rounded font-medium disabled:opacity-50"
                            >
                                {isPending ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
