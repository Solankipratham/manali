/**
 * Path handling for TripKhata's single-page, modal-based navigation.
 *
 * TripKhata is NOT a routed multi-page app. There is exactly one real entry
 * point — the shared ledger at the app root. The report, the expense form and
 * the audit history are modals, and they deliberately do not own a URL.
 *
 * So "is this a real page?" reduces to: does the pathname point at the app
 * root? Everything else is an unknown URL and must render the 404 view.
 */

/** The path the app is mounted at ("/" normally, "/sub" under a sub-path deploy). */
function basePath(): string {
  const raw = (import.meta.env.BASE_URL as string | undefined) || '/';
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Collapses trailing slashes so "/foo/" and "/foo" compare equal. */
export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * True when `pathname` points at a real page of this application.
 *
 * Known paths:
 *   • the app root ("/") — the ledger, and the `/?report=1` deep-link
 *   • "/index.html" — the direct file form of the same page
 *
 * Query strings and hashes are not part of `pathname`, so `/?report=1` and
 * `/#report` are both correctly treated as known. Modal states (report open,
 * expense form, audit history) are intentionally NOT routes.
 */
export function isKnownPath(pathname: string | null | undefined): boolean {
  // No information available → never break the app by guessing "unknown".
  if (!pathname) return true;

  const base = basePath();
  const path = normalizePath(pathname);
  const index = base === '/' ? '/index.html' : `${base}/index.html`;

  return path === base || path === index;
}

/**
 * Set once this tab has demonstrably navigated inside the application, i.e.
 * there is at least one same-document history entry behind the current one.
 * Updated on popstate and on every pushState/replaceState we perform.
 */
let internalNavigation = false;

export function markInternalNavigation(): void {
  internalNavigation = true;
}

/**
 * True when "Go Back" can actually land on a previous page of this app
 * instead of doing nothing (no entry behind us) or leaving the site.
 *
 * Two signals, in order of reliability:
 *   1. we have moved within this document → a real entry exists behind us;
 *   2. the document was loaded from a same-origin page → the browser has
 *      something to go back to within this app.
 *
 * Note this is a heuristic: browsers do not expose the URL of the previous
 * history entry, and NotFound adds a timeout fallback for the one case where
 * history.back() silently does nothing.
 */
export function canGoBack(): boolean {
  if (internalNavigation) return true;

  const referrer = document.referrer;
  if (!referrer) return false;

  try {
    return new URL(referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
