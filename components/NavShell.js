"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import FeedbackPrompt from "@/components/FeedbackPrompt";
import GlossIcon from "@/components/GlossIcon";
import ThemeToggle from "@/components/ThemeToggle";
import ScreenTimeGate from "@/components/ScreenTimeGate";
import GuestGate from "@/components/GuestGate";
import EmailVerifyBanner from "@/components/EmailVerifyBanner";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import { isTabRoot, getBackFallback } from "@/lib/backRoutes";
import {
  Menu, X, ArrowLeft, Home, Bot, GraduationCap, PenLine, Dumbbell,
  Users, Heart, History, Bell, Crown, Settings, User,
  LogOut, Lock, MessageCircle, Film, Zap, Gem, Coins,
} from "lucide-react";

// 1234 -> "1.2k", so the coin pill stays small in the header.
function shortCount(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(v);
}

// Side menu (opens from the hamburger). Business, Travel, Home Tools and
// Collections have been moved out as Vreedits becomes a study app.
const NAV_ITEMS = [
  { id: "home", labelKey: "nav.home", href: "/dashboard", icon: Home, gloss: "home", available: true },
  { id: "feed", labelKey: "nav.feed", fallbackLabel: "Feed", href: "/feed", icon: Film, gloss: "feed", available: true },
  { id: "inbox", labelKey: "nav.inbox", href: "/inbox", icon: MessageCircle, gloss: "inbox", available: true },
  { id: "ai-tools", labelKey: "nav.aiTools", href: "/ai-tools", icon: Bot, gloss: "ai-tools", available: true },
  { id: "school", labelKey: "nav.school", href: "/tools/school", icon: GraduationCap, gloss: "school", available: true },
  { id: "writing", labelKey: "nav.writing", href: "/tools/writing", icon: PenLine, gloss: "writing", available: true },
  { id: "mind-gym", labelKey: "nav.mindGym", fallbackLabel: "Mind Gym", href: "/mind-gym", icon: Dumbbell, gloss: "mind-gym", available: true },
  { id: "communities", labelKey: "nav.communities", href: "/communities", icon: Users, gloss: "communities", available: true },
  { id: "favorites", labelKey: "nav.favorites", href: "/favourites", icon: Heart, gloss: "favorites", available: true },
  { id: "history", labelKey: "nav.history", href: "/history", icon: History, gloss: "history", available: true },
  { id: "notifications", labelKey: "nav.notifications", href: "/notifications", icon: Bell, gloss: "notifications", available: true },
  { id: "premium", labelKey: "nav.premium", href: "/premium", icon: Crown, gloss: "premium", available: false },
  { id: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings, gloss: "settings", available: true },
  { id: "profile", labelKey: "nav.profile", href: "/profile", icon: User, gloss: "profile", available: true },
];

// The five primary tabs. "match" lists every route that belongs to a tab,
// so the right tab lights up on its sub-pages too.
const TAB_ITEMS = [
  {
    id: "home", labelKey: "nav.home", fallbackLabel: "Home", href: "/dashboard",
    icon: Home, gloss: "home", match: ["/dashboard"],
  },
  {
    id: "network", labelKey: "nav.network", fallbackLabel: "Network", href: "/communities",
    icon: Users, gloss: "communities", match: ["/communities", "/inbox"],
  },
  {
    id: "syna", labelKey: "nav.synaAi", fallbackLabel: "Syna AI", href: "/ai-tools",
    icon: Bot, gloss: "ai-tools", match: ["/ai-tools", "/tools/school", "/tools/writing"],
  },
  {
    id: "mind-gym", labelKey: "nav.mindGym", fallbackLabel: "Mind Gym", href: "/mind-gym",
    icon: Dumbbell, gloss: "mind-gym", match: ["/mind-gym"],
  },
  {
    id: "profile", labelKey: "nav.profile", fallbackLabel: "Profile", fullLabel: "Profile & Control", href: "/profile",
    icon: User, gloss: "profile",
    match: ["/profile", "/settings", "/favourites", "/history", "/notifications", "/premium"],
  },
];

// Pages that behave like a home tab (hamburger, no back arrow). lib/backRoutes.js
// decides for older pages; this list covers the new ones without touching it.
const EXTRA_TAB_ROOTS = ["/dashboard", "/mind-gym", "/communities", "/inbox", "/ai-tools", "/profile"];

function matchesTab(pathname, tab) {
  return tab.match.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function NavShellInner({ children, user }) {
  const { t } = useLanguage();
  // Falls back to plain English when a translation key doesn't exist yet.
  const tr = (key, fallback) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // Coin balances { neurons, gems, vcoins }. Stays null (nothing shown) for guests or if the wallet can't be reached.
  const [wallet, setWallet] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const profileRef = useRef(null);

  const inFeedSection = pathname.startsWith("/feed") || pathname.startsWith("/settings/feed");
  const popoverSettingsHref = inFeedSection ? "/settings/feed" : "/settings";

  // Screens that need the full height (chat-style screens with their own input bar)
  const hideTabBar =
    /^\/communities\/[^/]+/.test(pathname) ||
    /^\/inbox\/[^/]+/.test(pathname) ||
    pathname.startsWith("/ai-tools/chat");

  // The video feed draws its own header, so the shared bar stays hidden there.
  // The universal exit arrow is drawn on top of it instead (see below).
  const hideTopBar = pathname === "/feed";

  // Network tab has two sides: Communities and Messages.
  const showNetworkSwitch = pathname === "/communities" || pathname === "/inbox";

  const showBack = !isTabRoot(pathname) && !EXTRA_TAB_ROOTS.includes(pathname);
  const backHref = getBackFallback(pathname);

  useEffect(() => {
    function handleClick(e) {
      if (
        menuOpen && menuRef.current && !menuRef.current.contains(e.target) &&
        hamburgerRef.current && !hamburgerRef.current.contains(e.target)
      ) setMenuOpen(false);
      if (
        profileMenuOpen && profileRef.current && !profileRef.current.contains(e.target)
      ) setProfileMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, profileMenuOpen]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") { setMenuOpen(false); setProfileMenuOpen(false); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const userId = user?.id;
  const isGuest = !!user?.isGuest;
  const loadWallet = useCallback(async () => {
    if (!userId || isGuest) { setWallet(null); return; }
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.balances) setWallet(data.balances);
    } catch {}
  }, [userId, isGuest]);

  // Loads on every screen, and again whenever a game pays out or you come back to the app.
  useEffect(() => {
    loadWallet();
    window.addEventListener("vreedits:wallet-changed", loadWallet);
    window.addEventListener("focus", loadWallet);
    return () => {
      window.removeEventListener("vreedits:wallet-changed", loadWallet);
      window.removeEventListener("focus", loadWallet);
    };
  }, [loadWallet]);

  // Lets a page that draws its own header open the side menu.
  useEffect(() => {
    function onToggle() {
      setMenuOpen((v) => !v);
      router.refresh();
    }
    window.addEventListener("vreedits:toggle-menu", onToggle);
    return () => window.removeEventListener("vreedits:toggle-menu", onToggle);
  }, [router]);

  // The hamburger isn't rendered while showBack is true, so close the menu
  // if it was left open before navigating into a sub-page.
  useEffect(() => {
    if (showBack) setMenuOpen(false);
  }, [showBack]);

  function isItemActive(item) {
    if (pathname === item.href) return true;
    if (item.href !== "/" && pathname.startsWith(item.href + "/")) return true;
    return false;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function toggleMenu() {
    setMenuOpen((v) => !v);
    router.refresh();
  }

  function toggleProfileMenu() {
    setProfileMenuOpen((v) => !v);
    router.refresh();
  }

  function openGuestSignup() {
    setProfileMenuOpen(false);
    setMenuOpen(false);
    window.dispatchEvent(new Event("vreedits:open-signup"));
  }

  return (
    <div className="v-app-shell">
      <PresenceHeartbeat />
      <FeedbackPrompt />
      <style>{`
        .vreedits-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: calc(env(safe-area-inset-top, 0px) + 7px) 14px 7px;
          border-bottom: 1px solid var(--border); background: var(--glass);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          position: relative; z-index: 30; flex-shrink: 0;
        }
        .vreedits-topbar-left { display: flex; align-items: center; gap: 8px; }
        .vreedits-topbar-right { display: flex; align-items: center; gap: 8px; }
        .vreedits-hamburger {
          width: 38px; height: 38px; border-radius: 11px; border: 1px solid var(--border);
          background: var(--surface-2); display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text);
        }
        /* Neuron counter in the top bar (hidden on very narrow phones; the side menu shows all three balances). */
        .vreedits-coins {
          display: flex; align-items: center; gap: 5px; height: 38px; padding: 0 11px;
          border-radius: 11px; border: 1px solid var(--border); background: var(--accent-soft);
          color: var(--accent); font-size: 13.5px; font-weight: 700; text-decoration: none;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 359px) { .vreedits-coins { display: none; } }
        .vreedits-wallet-row {
          display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 8px 10px;
          border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2);
          color: var(--text); text-decoration: none; font-size: 13px; font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .vreedits-wallet-row span { display: inline-flex; align-items: center; gap: 4px; }
        .vreedits-brand {
          font-family: var(--font-display);
          font-size: 24px;
          font-weight: 700;
          line-height: 1;
          color: var(--accent);
          letter-spacing: 0.3px;
        }

        /* Universal exit arrow that floats over screens with their own header (the video feed). */
        .vreedits-float-exit {
          position: fixed; left: 12px; top: calc(var(--safe-t, env(safe-area-inset-top, 0px)) + 3px);
          z-index: 35; width: 38px; height: 38px; border-radius: 11px;
          border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.45);
          color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }

        ${hideTopBar ? `/* The old small profile icon in the feed's top-left is replaced by the exit arrow. */
        a[aria-label="My Profile"] { visibility: hidden; pointer-events: none; }` : ""}

        /* Communities | Messages switch under the top bar */
        .vreedits-netswitch {
          display: flex; gap: 4px; padding: 4px; margin: 10px 14px 0; flex-shrink: 0;
          border: 1px solid var(--border); border-radius: 14px; background: var(--surface-2);
        }
        .vreedits-netswitch a {
          flex: 1; text-align: center; padding: 8px 0; border-radius: 10px;
          font-size: 13.5px; font-weight: 600; color: var(--text-muted); text-decoration: none;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .vreedits-netswitch a.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 0 var(--border); }

        .vreedits-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
          transition: opacity 0.25s ease; z-index: 40;
        }
        .vreedits-overlay.open { opacity: 1; pointer-events: auto; }
        .vreedits-menu {
          position: fixed; top: 0; left: 0; bottom: 0; width: min(320px, 86vw);
          background: var(--menu-bg); border-right: 1px solid var(--border);
          box-shadow: var(--shadow); transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.22,1,0.36,1); z-index: 50;
          display: flex; flex-direction: column; overflow-y: auto;
        }
        .vreedits-menu.open { transform: translateX(0); }
        .vreedits-menu-close {
          position: absolute; top: 12px; right: 12px; z-index: 5;
          width: 40px; height: 40px; border-radius: 12px;
          border: 1px solid var(--border); background: var(--surface-2); display: flex;
          align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted);
        }
        .vreedits-profile-block { padding: 28px 20px 18px; border-bottom: 1px solid var(--border); }
        .vreedits-avatar-wrap { position: relative; width: 64px; height: 64px; cursor: pointer; }
        .vreedits-avatar {
          width: 64px; height: 64px; border-radius: 50%; object-fit: cover;
          box-shadow: 0 0 0 2px var(--border); display: flex; align-items: center; justify-content: center;
          background: var(--accent-soft); color: var(--accent); font-family: var(--font-display);
          font-weight: 600; font-size: 22px;
        }
        .vreedits-status-dot {
          position: absolute; bottom: 1px; right: 1px; width: 15px; height: 15px; border-radius: 50%;
          border: 2.5px solid var(--surface);
        }
        .vreedits-status-dot.online { background: var(--success); }
        .vreedits-status-dot.offline { background: var(--text-muted); }
        .vreedits-name-row { display: flex; align-items: center; gap: 6px; margin-top: 12px; cursor: pointer; }
        .vreedits-display-name { font-size: 16px; font-weight: 600; }
        .vreedits-popover-panel {
          position: absolute; top: 4px; left: 0; width: 200px; background: var(--surface);
          border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); padding: 6px;
          z-index: 60; opacity: 0; transform: translateY(-6px); pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .vreedits-popover-panel.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
        .vreedits-popover-item {
          display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border-radius: 9px;
          font-size: 13.5px; font-weight: 500; color: var(--text); background: transparent; border: none;
          cursor: pointer; text-align: left;
        }
        .vreedits-popover-item:hover { background: var(--surface-2); }
        .vreedits-popover-item.danger { color: var(--danger); }
        .vreedits-nav-scroll { padding: 10px 12px 14px; flex: 1; }
        .vreedits-nav-item {
          display: flex; align-items: center; gap: 12px; width: 100%; padding: 6px 12px; border-radius: 14px;
          border: 1px solid transparent; background: transparent; color: var(--text); font-size: 15px;
          font-weight: 500; cursor: pointer; margin-bottom: 2px; text-align: left;
        }
        .vreedits-nav-item:hover { background: var(--accent-soft); }
        .vreedits-nav-item.active {
          background: var(--accent-soft); color: var(--text); border-color: var(--border);
        }
        .vreedits-nav-item.locked { opacity: 0.6; cursor: not-allowed; }
        .vreedits-lock-badge { margin-left: auto; }
        .vreedits-content { flex: 1; min-height: 0; overflow-y: auto; }

        /* ───────── Bottom tab bar ───────── */
        .vreedits-tabbar {
          display: flex; align-items: stretch; flex-shrink: 0; position: relative; z-index: 30;
          padding: 3px 4px calc(3px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border); background: var(--glass);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        }
        .vreedits-tab {
          flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center;
          gap: 1px; padding: 2px 0; border-radius: 12px; text-decoration: none;
          color: var(--text-muted); font-size: 10px; font-weight: 500;
          transition: color 0.15s ease, transform 0.1s ease;
        }
        .vreedits-tab:active { transform: scale(0.94); }
        .vreedits-tab-icon {
          width: 52px; height: 32px; border-radius: 999px; display: flex;
          align-items: center; justify-content: center; opacity: 0.8;
          transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
        }
        .vreedits-tab.active { color: var(--accent); font-weight: 600; }
        .vreedits-tab.active .vreedits-tab-icon {
          background: var(--accent-soft); opacity: 1; transform: translateY(-1px) scale(1.06);
        }
        .vreedits-tab-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* On desktop the tabs sit in a slim centred bar instead of stretching edge to edge. */
        @media (min-width: 1024px) {
          .vreedits-tabbar { justify-content: center; gap: 12px; }
          .vreedits-tab { flex: 0 0 auto; width: 104px; }
        }
      `}</style>      {!hideTopBar && (
        <div className="vreedits-topbar">
          {showBack ? (
            <button
              className="vreedits-hamburger tappable"
              onClick={() => router.push(backHref)}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="vreedits-topbar-left">
              {/* Exit arrow on every main screen: always goes Home. Home itself has none. */}
              {pathname !== "/dashboard" && (
                <button
                  className="vreedits-hamburger tappable"
                  onClick={() => router.push("/dashboard")}
                  aria-label="Back to Home"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <button ref={hamburgerRef} className="vreedits-hamburger tappable" onClick={toggleMenu} aria-label="Open menu">
                <Menu size={20} />
              </button>
            </div>
          )}
          <span className="vreedits-brand">Vreedits</span>
          <div className="vreedits-topbar-right">
            {wallet && (
              <Link href="/profile#wallet" className="vreedits-coins tappable" aria-label={`${wallet.neurons} Neurons. Open wallet`}>
                <Zap size={15} /> {shortCount(wallet.neurons)}
              </Link>
            )}
            <Link href="/notifications" className="vreedits-hamburger tappable" aria-label="Notifications">
              <GlossIcon name="notifications" size={26} />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* Same exit arrow for screens that hide the shared top bar (the video feed). */}
      {hideTopBar && (
        <button
          type="button"
          className="vreedits-float-exit tappable"
          onClick={() => router.push("/dashboard")}
          aria-label="Back to Home"
        >
          <ArrowLeft size={20} />
        </button>
      )}

      {showNetworkSwitch && (
        <div className="vreedits-netswitch" role="tablist" aria-label="Network">
          <Link href="/communities" className={pathname === "/communities" ? "active" : ""} role="tab" aria-selected={pathname === "/communities"}>
            {tr("nav.communities", "Communities")}
          </Link>
          <Link href="/inbox" className={pathname === "/inbox" ? "active" : ""} role="tab" aria-selected={pathname === "/inbox"}>
            {tr("nav.inbox", "Messages")}
          </Link>
        </div>
      )}

      <EmailVerifyBanner />

      <div className={`vreedits-overlay ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />

      <nav ref={menuRef} className={`vreedits-menu ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="vreedits-menu-close tappable"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        <div className="vreedits-profile-block">
          <div style={{ position: "relative" }} ref={profileRef}>
            <div className="vreedits-avatar-wrap" onClick={toggleProfileMenu}>
              {user?.avatarDataUrl ? (
                <img className="vreedits-avatar" src={user.avatarDataUrl} alt="Profile" />
              ) : (
                <div className="vreedits-avatar">{(user?.displayName || user?.username)?.slice(0, 2).toUpperCase()}</div>
              )}
              <span className={`vreedits-status-dot ${user?.online ? "online" : "offline"}`} />
            </div>
            <div className="vreedits-name-row" onClick={toggleProfileMenu}>
              <span className="vreedits-display-name">{user?.displayName || user?.username}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 1 }}>
              @{user?.username?.toLowerCase()}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
              {user?.online ? t("common.online") : t("common.offline")}
            </div>
            {wallet && (
              <Link href="/profile#wallet" className="vreedits-wallet-row" onClick={() => setMenuOpen(false)} aria-label="Open wallet">
                <span title="Neurons"><Zap size={14} /> {shortCount(wallet.neurons)}</span>
                <span title="Gems"><Gem size={14} /> {shortCount(wallet.gems)}</span>
                <span title="V-Coins"><Coins size={14} /> {shortCount(wallet.vcoins)}</span>
              </Link>
            )}

            <div className={`vreedits-popover-panel ${profileMenuOpen ? "open" : ""}`}>
              <Link href="/profile" className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <User size={15} /> {t("menu.viewProfile")}
              </Link>
              <Link href="/profile" className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <User size={15} /> {t("menu.editProfile")}
              </Link>
              <Link href={popoverSettingsHref} className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <Settings size={15} /> {t("nav.settings")}
              </Link>
              {user?.isGuest && (
                <button className="vreedits-popover-item" onClick={openGuestSignup}>
                  <User size={15} /> Create account
                </button>
              )}
              <button className="vreedits-popover-item danger" onClick={handleLogout}>
                <LogOut size={15} /> {t("nav.logout")}
              </button>
            </div>
          </div>
        </div>

        <div className="vreedits-nav-scroll">
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item);
            const label = tr(item.labelKey, item.fallbackLabel || item.labelKey);
            if (!item.available) {
              return (
                <div key={item.id} className="vreedits-nav-item locked" title={t("common.comingSoon")}>
                  <GlossIcon name={item.gloss} size={38} fallback={item.icon} />
                  {label}
                  <Lock size={14} className="vreedits-lock-badge" />
                </div>
              );
            }
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`vreedits-nav-item tappable ${isActive ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <GlossIcon name={item.gloss} size={38} fallback={item.icon} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="vreedits-content v-main">
        <ScreenTimeGate>
          <GuestGate user={user}>{children}</GuestGate>
        </ScreenTimeGate>
      </div>

      {!hideTabBar && (
        <nav className="vreedits-tabbar" aria-label="Main">
          {TAB_ITEMS.map((item) => {
            const active = matchesTab(pathname, item);
            const label = tr(item.labelKey, item.fallbackLabel);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`vreedits-tab ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                aria-label={item.fullLabel || label}
              >
                <span className="vreedits-tab-icon">
                  <GlossIcon name={item.gloss} size={30} fallback={item.icon} />
                </span>
                <span className="vreedits-tab-label">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export default function NavShell({ children, user }) {
  return (
    <LanguageProvider userLanguage={user?.language}>
      <NavShellInner user={user}>{children}</NavShellInner>
    </LanguageProvider>
  );
}