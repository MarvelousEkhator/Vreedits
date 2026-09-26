// Central place that decides, for any URL in the app, what the top-left
// button in NavShell does. Add one line here when a new sub-page is
// created — no other file ever needs to change for the back arrow to
// work on it.

// Top-level tab screens show the hamburger menu instead of a back arrow,
// since there's nowhere "back" to go from a home screen.
export const TAB_ROOTS = ["/feed", "/inbox", "/ai-tools", "/communities", "/profile"];

// Ordered list of [pattern, fallbackHref]. First match wins.
const RULES = [
  [/^\/inbox\/[^/]+$/, "/inbox"],
  [/^\/communities\/[^/]+$/, "/communities"],
  [/^\/profile\/[^/]+$/, "/profile"],
  [/^\/ai-tools\/chat/, "/ai-tools"],
  [/^\/settings\/feed/, "/settings"],
  [/^\/settings/, "/feed"],
  [/^\/help/, "/settings"],
  [/^\/contact/, "/settings"],
  [/^\/tools\//, "/feed"],
];

export function isTabRoot(pathname) {
  return TAB_ROOTS.includes(pathname);
}

export function getBackFallback(pathname) {
  for (const [pattern, href] of RULES) {
    if (pattern.test(pathname)) return href;
  }
  return "/feed";
}