import { useState, type MouseEvent } from 'react';
import type { Member } from '../lib/types';
import { Avatar, IconReport } from './ui';
import { storageMode } from '../lib/storage';

interface Props {
  members: Member[];
  activeMemberId: string;
  onSwitchMember: (id: string) => void;
  onOpenReport: () => void;
  /** Returns to the home / dashboard screen. */
  onHome: () => void;
}

export default function Header({
  members,
  activeMemberId,
  onSwitchMember,
  onOpenReport,
  onHome,
}: Props) {
  const active = members.find((m) => m.id === activeMemberId) ?? members[0];

  // Brand logo served from public/tripkhata-logo.png. If the file is missing,
  // fall back to the original ₹ mark so the navbar never shows a broken image.
  const [logoOk, setLogoOk] = useState(true);

  // Left-click navigates in-app; modified clicks (new tab / window) keep the
  // browser's native behaviour because we only intercept a plain left click.
  const handleLogoClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onHome();
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <a
          href="/"
          onClick={handleLogoClick}
          aria-label="TripKhata — go to the dashboard"
          className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          {logoOk ? (
            <img
              src="/tripkhata-logo.png"
              alt=""
              onError={() => setLogoOk(false)}
              className="h-8 max-w-[88px] shrink-0 object-contain sm:h-9 sm:max-w-[150px]"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-sm">
              ₹
            </span>
          )}
          <div className="leading-tight">
            <p className="text-[15px] font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700">
              TripKhata
            </p>
            <p className="text-[11px] font-medium text-slate-500">
              Manali Trip · 5 members · shared ledger
            </p>
          </div>
        </a>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`hidden rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide sm:inline ${
              storageMode === 'supabase'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            }`}
            title={
              storageMode === 'supabase'
                ? 'Data is stored in Supabase with realtime sync'
                : 'Add Supabase credentials in .env to sync across devices'
            }
          >
            {storageMode === 'supabase' ? '● Live · Supabase' : '● Local mode'}
          </span>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-1.5 pr-1">
            {active && <Avatar name={active.name} size={26} />}
            <label className="flex items-center gap-1">
              <span className="sr-only">Select your profile</span>
              <select
                value={activeMemberId}
                onChange={(e) => onSwitchMember(e.target.value)}
                className="cursor-pointer bg-transparent pr-1 text-[13px] font-semibold text-slate-800 outline-none"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={onOpenReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <IconReport className="h-4 w-4" />
            <span className="hidden sm:inline">ALL TRIP DETAILS &amp; EXPENSES</span>
            <span className="sm:hidden">Report</span>
          </button>
        </div>
      </div>
    </header>
  );
}
