'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FlagRecord } from '../../lib/s3-storage';

export default function FlagReviewPanel({ flags, isAdmin }: { flags: FlagRecord[]; isAdmin: boolean }) {
    const router = useRouter();
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    if (!flags.length) return null;

    async function patch(id: string, body: object) {
        setBusy(id);
        const response = await fetch(`/api/flags/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setBusy(null);
        if (!response.ok) return alert((await response.json()).error || 'Could not update flag');
        router.refresh();
    }

    return <section className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold text-amber-200">Review flags</h2><p className="text-xs text-gray-400">{isAdmin ? 'Flags remain visible to the employee until you hide them.' : 'These items were flagged by the admin and remain visible until the admin hides them.'}</p></div><span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">{flags.filter((flag) => !flag.hidden).length}</span></div>
        <div className="space-y-3">{flags.map((flag) => <article key={flag._id} className={`rounded-lg border p-3 ${flag.hidden ? 'border-[#333] bg-[#181818] opacity-60' : 'border-amber-500/30 bg-[#1b1b1b]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-amber-400">{flag.targetType.replace('-', ' ')}{flag.hidden ? ' · hidden' : ''}</div><p className="mt-1 font-medium text-white">{flag.reason}</p><p className="mt-1 text-xs text-gray-500">Flagged {new Date(flag.createdAt).toLocaleString()}</p></div>{isAdmin && <button disabled={busy === flag._id} onClick={() => patch(flag._id, { hidden: !flag.hidden })} className="rounded border border-[#444] px-3 py-1 text-xs text-gray-300 hover:bg-[#333]">{flag.hidden ? 'Restore' : 'Hide'}</button>}</div>
            {flag.employeeResponse && <div className="mt-3 rounded bg-[#252525] p-3 text-sm"><span className="text-xs font-semibold uppercase text-sky-300">Employee response</span><p className="mt-1 text-gray-200">{flag.employeeResponse}</p></div>}
            {!isAdmin && <div className="mt-3 flex gap-2"><input value={responses[flag._id] ?? flag.employeeResponse} onChange={(event) => setResponses({ ...responses, [flag._id]: event.target.value })} placeholder="Reply to the admin" className="min-w-0 flex-1 rounded border border-[#444] bg-[#111] px-3 py-2 text-sm text-white"/><button disabled={busy === flag._id || !(responses[flag._id] ?? flag.employeeResponse).trim()} onClick={() => patch(flag._id, { employeeResponse: responses[flag._id] ?? flag.employeeResponse })} className="rounded bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Reply</button></div>}
        </article>)}</div>
    </section>;
}
