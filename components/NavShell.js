"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import GlossIcon from "@/components/GlossIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import { isTabRoot, getBackFallback } from "@/lib/backRoutes";
import {
  Menu, X, ArrowLeft, Home, Bot, GraduationCap, Briefcase, PenLine, Plane, Wrench,
  Users, Heart, History, FolderOpen, Bell, Crown, Settings, User,
  HelpCircle, Phone, LogOut, Lock, MessageCircle,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "home", labelKey: "nav.home", href: "/feed", icon: Home, gloss: "home", available: true },
  { id: "inbox", labelKey: "nav.inbox", href: "/inbox", icon: MessageCircle, gloss: "inbox", available: true },
  { id: "ai-tools", labelKey: "nav.aiTools", href: "/ai-tools", icon: Bot, gloss: "ai-tools", available: true },
  { id: "school", labelKey: "nav.school", href: "/tools/school", icon: GraduationCap, gloss: "school", available: true },
  { id: "business", labelKey: "nav.business", href: "/tools/business", icon: Briefcase, gloss: "business", available: true },
  { id: "writing", labelKey: "nav.writing", href: "/tools/writing", icon: PenLine, gloss: "writing", available: true },
  { id: "travel", labelKey: "nav.travel", href: "/tools/travel", icon: Plane, gloss: "travel", available: true },
  { id: "home-tools", labelKey: "nav.homeTools", href: "/tools/home", icon: Wrench, gloss: "home-tools", available: true },
  { id: "communities", labelKey: "nav.communities", href: "/communities", icon: Users, gloss: "communities", available: true },
  { id: "favorites", labelKey: "nav.favorites", href: "/favourites", icon: Heart, gloss: "favorites", available: true },
  { id: "history", labelKey: "nav.history", href: "/history", icon: History, gloss: "history", available: true },
  { id: "collections", labelKey: "nav.collections", href: "/collections", icon: FolderOpen, gloss: "collections", available: true },
  { id: "notifications", labelKey: "nav.notifications", href: "/notifications", icon: Bell, gloss: "notifications", available: true },
  { id: "premium", labelKey: "nav.premium", href: "/premium", icon: Crown, gloss: "premium", available: false },
  { id: "settings", labelKey: "nav.settings", href: "/settings", icon: Settings, gloss: "settings", available: true },
  { id: "profile", labelKey: "nav.profile", href: "/profile", icon: User, gloss: "profile", available: true },
];

// Bottom tab bar (mobile only). The hamburger menu still holds every section.
// Uses the same glossy icons as the hamburger menu.
const TAB_ITEMS = [
  { id: "home", labelKey: "nav.home", href: "/feed", icon: Home, gloss: "home" },
  { id: "inbox", labelKey: "nav.inbox", href: "/inbox", icon: MessageCircle, gloss: "inbox" },
  { id: "ai-tools", labelKey: "nav.aiTools", href: "/ai-tools", icon: Bot, gloss: "ai-tools" },
  { id: "communities", labelKey: "nav.communities", href: "/communities", icon: Users, gloss: "communities" },
  { id: "profile", labelKey: "nav.profile", href: "/profile", icon: User, gloss: "profile" },
];

function NavShellInner({ children, user }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  // Whether this page gets a back arrow (any sub-page) instead of the
  // hamburger menu (home tabs only). This is the ONE thing that decides
  // the top-left button everywhere in the app — no other file needs to
  // import or render anything for this to work on a new page. Add a rule
  // to lib/backRoutes.js if a new page needs a specific "back to" target.
  const showBack = !isTabRoot(pathname);
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

  // The hamburger button isn't rendered while showBack is true, so if the
  // menu was left open before navigating into a sub-page, close it here —
  // otherwise there'd be no way to close it (the outside-click handler
  // above needs hamburgerRef, which won't exist on this page).
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

  // Forces Next.js to throw away whatever cached render it has for the
  // current route and fetch fresh server data before showing the menu —
  // this is what actually guarantees up-to-date name/avatar here, since
  // relying on cache-timing config alone wasn't reliably catching every
  // navigation path.
  function toggleMenu() {
    setMenuOpen((v) => !v);
    router.refresh();
  }

  function toggleProfileMenu() {
    setProfileMenuOpen((v) => !v);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <PresenceHeartbeat />
      <style>{`
        .vreedits-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--glass);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          position: relative; z-index: 30; flex-shrink: 0;
        }
        .vreedits-hamburger {
          width: 42px; height: 42px; border-radius: 12px; border: 1px solid var(--border);
          background: var(--surface-2); display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text);
        }
        .vreedits-brand {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
          line-height: 1;
          color: var(--accent);
          letter-spacing: 0.3px;
        }
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
          position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 10px;
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

        /* ───────── Bottom tab bar (mobile) ───────── */
        .vreedits-tabbar {
          display: flex; align-items: stretch; flex-shrink: 0; position: relative; z-index: 30;
          padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border); background: var(--glass);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        }
        .vreedits-tab {
          flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center;
          gap: 2px; padding: 3px 0; border-radius: 12px; text-decoration: none;
          color: var(--text-muted); font-size: 10.5px; font-weight: 500;
          transition: color 0.15s ease, transform 0.1s ease;
        }
        .vreedits-tab:active { transform: scale(0.94); }
        .vreedits-tab-icon {
          width: 56px; height: 38px; border-radius: 999px; display: flex;
          align-items: center; justify-content: center; opacity: 0.8;
          transition: background 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
        }
        .vreedits-tab.active { color: var(--accent); font-weight: 600; }
        .vreedits-tab.active .vreedits-tab-icon {
          background: var(--accent-soft); opacity: 1; transform: translateY(-1px) scale(1.06);
        }
        .vreedits-tab-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (min-width: 1024px) { .vreedits-tabbar { display: none; } }
      `}</style>

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
          <button ref={hamburgerRef} className="vreedits-hamburger tappable" onClick={toggleMenu} aria-label="Open menu">
            <Menu size={20} />
          </button>
        )}
        <span className="vreedits-brand">Vreedits</span>
        <ThemeToggle />
      </div>

      <div className={`vreedits-overlay ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />

      <nav ref={menuRef} className={`vreedits-menu ${menuOpen ? "open" : ""}`}>
        <button className="vreedits-menu-close tappable" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <X size={17} />
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
              <button className="vreedits-popover-item danger" onClick={handleLogout}>
                <LogOut size={15} /> {t("nav.logout")}
              </button>
            </div>
          </div>
        </div>

        <div className="vreedits-nav-scroll">
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item);
            if (!item.available) {
              return (
                <div key={item.id} className="vreedits-nav-item locked" title={t("common.comingSoon")}>
                  <GlossIcon name={item.gloss} size={38} fallback={item.icon} />
                  {t(item.labelKey)}
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
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="vreedits-content">{children}</div>

      {!hideTabBar && (
        <nav className="vreedits-tabbar" aria-label="Main">
          {TAB_ITEMS.map((item) => {
            const active = isItemActive(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`vreedits-tab ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="vreedits-tab-icon">
                  <GlossIcon name={item.gloss} size={34} fallback={item.icon} />
                </span>
                <span className="vreedits-tab-label">{t(item.labelKey)}</span>
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