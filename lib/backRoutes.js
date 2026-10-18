// Central place that decides, for any URL in the app, what the top-left
// arrow in NavShell does. Add one line here when a new sub-page is
// created. No other file needs to change for the arrow to work on it.
//
// Rule of thumb: the arrow always goes UP one level (to the page's parent),
// and every main screen goes up to Home. It never goes to Feed unless the
// page really lives under Feed.

// Main screens: they show the menu button (plus an arrow back to Home)
// instead of a "go up" arrow.
export const TAB_ROOTS = [
  "/dashboard", "/feed", "/inbox", "/ai-tools", "/communities", "/profile", "/mind-gym",
];

// Ordered list of [pattern, parentHref]. First match wins.
const RULES = [
  // Messages and communities
  [/^\/inbox\/[^/]+$/, "/inbox"],
  [/^\/communities\/[^/]+/, "/communities"],
  [/^\/invite\//, "/communities"],

  // Profiles
  [/^\/profile\/edit/, "/profile"],
  [/^\/profile\/[^/]+$/, "/profile"],
  [/^\/u\//, "/dashboard"],

  // Syna AI
  [/^\/ai-tools\/[^/]+/, "/ai-tools"],

  // School tools, one level up each time
  [/^\/tools\/school\/flashcards\/[^/]+/, "/tools/school/flashcards"],
  [/^\/tools\/school\/study-room\/[^/]+/, "/tools/school/study-room"],
  [/^\/tools\/school\/[^/]+/, "/tools/school"],
  [/^\/notes\/[^/]+/, "/tools/school"],
  [/^\/notes/, "/tools/school"],

  // Old business pages
  [/^\/tools\/business\/clients\/[^/]+/, "/tools/business"],
  [/^\/tools\/business\/projects\/[^/]+/, "/tools/business/projects"],
  [/^\/tools\/business\/[^/]+/, "/tools/business"],

  // Settings and the pages that live under Profile & Control
  [/^\/settings\/feed\/[^/]+/, "/settings/feed"],
  [/^\/settings\/feed/, "/settings"],
  [/^\/settings\/[^/]+/, "/settings"],
  [/^\/settings/, "/profile"],
  [/^\/(favourites|favorites|history|notifications|premium)/, "/profile"],
  [/^\/(help|contact|privacy|terms)/, "/settings"],

  // Any other tool page goes straight back Home
  [/^\/tools\//, "/dashboard"],
];

export function isTabRoot(pathname) {
  return TAB_ROOTS.includes(pathname);
}

export function getBackFallback(pathname) {
  for (const [pattern, href] of RULES) {
    if (pattern.test(pathname)) return href;
  }
  return "/dashboard";
}
