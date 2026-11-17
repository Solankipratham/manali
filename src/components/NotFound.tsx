import { useEffect } from 'react';
import { canGoBack } from '../lib/routes';

/* ------------------------------- icons --------------------------------
 * lucide-react is not installed in this project, so the two glyphs the
 * buttons need are drawn inline in the same 24x24 / stroke-2 style used by
 * src/components/ui.tsx.
 * -------------------------------------------------------------------- */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const IconHome = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.6V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.6" />
  </svg>
);

const IconArrowLeft = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </svg>
);

/* ----------------------------- illustration ---------------------------
 * A map card with a route that stops short of a "?" pin, plus a floating
 * expense receipt — travel + expense tracking, in TripKhata's palette.
 * -------------------------------------------------------------------- */

function LostRouteIllustration() {
  return (
    <svg
      viewBox="0 0 440 320"
      className="h-auto w-full max-w-[460px]"
      role="img"
      aria-label="A dashed route across a map that stops short of a missing destination, next to an expense receipt"
    >
      <defs>
        <linearGradient id="tkMap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="55%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <linearGradient id="tkPin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <filter id="tkShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
        <filter id="tkShadowSm" x="-45%" y="-45%" width="190%" height="190%">
          <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.16" />
        </filter>
      </defs>

      {/* ambient shapes */}
      <circle cx="62" cy="56" r="66" fill="#d1fae5" opacity="0.7" />
      <circle cx="368" cy="58" r="34" fill="#ecfdf5" opacity="0.9" />
      <circle cx="394" cy="280" r="78" fill="#e2e8f0" opacity="0.75" />

      {/* map card */}
      <g filter="url(#tkShadow)">
        <rect x="34" y="42" width="292" height="222" rx="24" fill="url(#tkMap)" stroke="#e2e8f0" />
      </g>

      {/* roads */}
      <g stroke="#cbd5e1" fill="none" strokeLinecap="round">
        <path d="M34 124h292" strokeWidth="11" opacity="0.5" />
        <path d="M138 42v222" strokeWidth="11" opacity="0.5" />
        <path d="M34 204h292" strokeWidth="7" opacity="0.35" />
        <path d="M244 42v222" strokeWidth="7" opacity="0.35" />
        <path d="M34 78h292" strokeWidth="5" opacity="0.25" />
      </g>

      {/* city blocks */}
      <rect x="150" y="136" width="82" height="54" rx="12" fill="#d1fae5" opacity="0.9" />
      <rect x="52" y="148" width="72" height="44" rx="12" fill="#e0f2fe" opacity="0.85" />
      <rect x="258" y="216" width="54" height="34" rx="10" fill="#f1f5f9" />

      {/* travelled portion of the route */}
      <path
        className="tk-route"
        d="M78 236C112 236 116 186 148 176S200 156 210 124"
        fill="none"
        stroke="#059669"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray="12 12"
      />

      {/* uncertain continuation */}
      <path
        d="M216 118C238 102 264 104 279 118"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray="5 13"
        opacity="0.8"
      />

      {/* start marker */}
      <circle cx="78" cy="236" r="10" fill="#ffffff" stroke="#059669" strokeWidth="4.5" />
      <circle cx="78" cy="236" r="3.5" fill="#059669" />

      {/* destination: unknown */}
      <g transform="translate(281 92)">
        <circle className="tk-blip" cx="0" cy="-1" r="20" fill="none" stroke="#34d399" strokeWidth="2" />
        <g filter="url(#tkShadowSm)">
          <path
            d="M0 36C-13 21 -21 11 -21 -1A21 21 0 1 1 21 -1C21 11 13 21 0 36Z"
            fill="url(#tkPin)"
            stroke="#065f46"
            strokeWidth="2"
          />
        </g>
        <circle cx="0" cy="-1" r="10" fill="#ffffff" />
        <text
          x="0"
          y="6.5"
          textAnchor="middle"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="20"
          fontWeight="800"
          fill="#047857"
        >
          ?
        </text>
      </g>

      {/* floating expense receipt */}
      <g transform="translate(274 174)" filter="url(#tkShadowSm)">
        <rect width="140" height="118" rx="18" fill="#ffffff" stroke="#e2e8f0" />
        <rect x="16" y="18" width="46" height="9" rx="4.5" fill="#e2e8f0" />
        <rect x="16" y="37" width="86" height="8" rx="4" fill="#f1f5f9" />
        <rect x="16" y="53" width="66" height="8" rx="4" fill="#f1f5f9" />
        <path
          d="M16 76h108"
          stroke="#e2e8f0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="5 7"
        />
        <text
          x="16"
          y="103"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="21"
          fontWeight="800"
          fill="#059669"
        >
          ₹4,850
        </text>
        <circle cx="116" cy="26" r="13" fill="#ecfdf5" />
        <path
          d="m110 26 4.5 4.5L122 22.5"
          fill="none"
          stroke="#059669"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/* -------------------------------- page -------------------------------- */

export interface NotFoundProps {
  /** Pushes (or replaces) a URL and tells the app to re-render for it. */
  onNavigate: (path: string, replace?: boolean) => void;
}

/**
 * TripKhata's premium 404 view.
 *
 * TripKhata is a modal-based SPA with a single real entry point ("/"), so
 * this component owns the whole document instead of living inside a route.
 * It never touches ledger state, modal state or Supabase.
 */
export default function NotFound({ onNavigate }: NotFoundProps) {
  const goHome = (replace = false) => onNavigate('/', replace);

  const goBack = () => {
    if (!canGoBack()) {
      // No previous internal page to return to — land on the dashboard.
      goHome(true);
      return;
    }

    // history.back() is a no-op when there is nothing behind the current
    // entry, and it does not report failure — so watch for popstate and
    // fall back to the dashboard if nothing moves.
    const onPop = () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener('popstate', onPop);
      goHome(true);
    }, 400);

    window.addEventListener('popstate', onPop);
    window.history.back();
  };

  useEffect(() => {
    const previous = document.title;
    document.title = 'Page not found — TripKhata';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50">
      {/* ambient background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="absolute bottom-[-6rem] left-1/3 h-64 w-64 rounded-full bg-emerald-50 blur-3xl" />
      </div>

      {/* brand */}
      <header className="relative z-10 px-5 pt-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-[15px] font-black text-white shadow-sm shadow-emerald-600/30"
          >
            ₹
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-slate-900">TripKhata</span>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center px-5 py-10 sm:px-8">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* copy */}
          <div className="tk-rise text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 shadow-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Error 404 · Page not found
            </span>

            <p
              aria-hidden="true"
              className="tk-rise tk-delay-1 mt-5 select-none text-[clamp(4.5rem,15vw,9rem)] font-black leading-[0.85] tracking-[-0.055em] text-slate-900"
            >
              4<span className="text-emerald-600">0</span>4
            </p>

            <h1 className="tk-rise tk-delay-2 mt-5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-[2.1rem]">
              Oops! You've lost your way.
            </h1>

            <p className="tk-rise tk-delay-2 mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-500 lg:mx-0">
              The page you're looking for doesn't exist, has been moved, or the link may be
              incorrect.
            </p>

            <div className="tk-rise tk-delay-3 mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button
                type="button"
                onClick={() => goHome()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-[14.5px] font-bold text-white shadow-lg shadow-emerald-600/25 transition duration-200 hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30 active:translate-y-px"
              >
                <IconHome className="h-[18px] w-[18px]" />
                Back to Dashboard
              </button>

              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-[14.5px] font-bold text-slate-700 shadow-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/25 active:translate-y-px"
              >
                <IconArrowLeft className="h-[18px] w-[18px]" />
                Go Back
              </button>
            </div>
          </div>

          {/* illustration */}
          <div className="tk-rise tk-delay-2 flex justify-center">
            <div className="tk-float">
              <LostRouteIllustration />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-5 pb-7 text-center text-[12.5px] leading-relaxed text-slate-500 sm:px-8">
        TripKhata · Your Trip, Your Expenses, All in One Place.
      </footer>
    </div>
  );
}
