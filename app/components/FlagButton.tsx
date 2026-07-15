'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FlagButton(props: { userId: string; logIds: string[]; targetType: 'screenshot' | 'time-block'; startTimestamp: string; endTimestamp: string; memo?: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    async function submit() {
        if (!reason.trim()) return;
        setSaving(true);
        const response = await fetch('/api/flags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...props, reason }) });
        setSaving(false);
        if (!response.ok) return alert((await response.json()).error || 'Could not add flag');
        setOpen(false); setReason(''); router.refresh();
    }

    return <>
        <button onClick={() => setOpen(true)} className="rounded border border-amber-500/50 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/10">Flag</button>
        {open && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-md rounded-xl border border-[#444] bg-[#202020] p-5" onClick={(event) => event.stopPropagation()}>
                <h3 className="mb-1 text-lg font-semibold text-white">Flag {props.targetType === 'time-block' ? 'time block' : 'screenshot'}</h3>
                <p className="mb-4 text-xs text-gray-400">The employee will see this reason until an admin hides the flag.</p>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} autoFocus placeholder="Explain the inconsistency or required correction" className="w-full rounded-lg border border-[#444] bg-[#151515] p-3 text-sm text-white outline-none focus:border-amber-500" />
                <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-gray-400">Cancel</button><button onClick={submit} disabled={saving || !reason.trim()} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? 'Saving...' : 'Add flag'}</button></div>
            </div>
        </div>}
    </>;
}
