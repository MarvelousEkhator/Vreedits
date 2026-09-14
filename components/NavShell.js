"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import {
  Menu, X, Home, Bot, GraduationCap, Briefcase, PenLine, Plane, Wrench,
  Users, Heart, History, FolderOpen, Bell, Crown, Settings, User,
  HelpCircle, Phone, LogOut, Lock,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/feed", icon: Home, available: true },
  { id: "ai-tools", label: "AI Tools", href: "/ai-tools", icon: Bot, available: true },
  { id: "school", label: "School", href: "/tools/school", icon: GraduationCap, available: true },
  { id: "business", label: "Business", href: "/tools/business", icon: Briefcase, available: true },
  { id: "writing", label: "Writing", href: "/tools/writing", icon: PenLine, available: true },
  { id: "travel", label: "Travel", href: "/tools/travel", icon: Plane, available: true },
  { id: "home-tools", label: "Home Tools", href: "/tools/home", icon: Wrench, available: true },
  { id: "communities", label: "Communities", href: "/communities", icon: Users, available: true },
  { id: "favorites", label: "Favorites", href: "/favourites", icon: Heart, available: true },
  { id: "history", label: "History", href: "/history", icon: History, available: true },
  { id: "collections", label: "Collections", href: "/collections", icon: FolderOpen, available: true },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell, available: true },
  { id: "premium", label: "Premium", href: "/premium", icon: Crown, available: false },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings, available: true },
  { id: "profile", label: "My Profile", href: "/profile", icon: User, available: true },
];

export default function NavShell({ children, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const profileRef = useRef(null);

  // The account popover's Settings link should follow whichever section
  // of the app you're actually in — feed pages (including feed settings
  // itself) go to /settings/feed, everything else goes to the main
  // Vreedits /settings, instead of always hardcoding one destination.
  const inFeedSection = pathname.startsWith("/feed") || pathname.startsWith("/settings/feed");
  const popoverSettingsHref = inFeedSection ? "/settings/feed" : "/settings";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <PresenceHeartbeat />
      <style>{`
        .vreedits-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--surface);
          position: relative; z-index: 30; flex-shrink: 0;
        }
        .vreedits-hamburger {
          width: 42px; height: 42px; border-radius: 12px; border: 1px solid var(--border);
          background: var(--surface-2); display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text);
        }
        .vreedits-brand { font-size: 17px; font-weight: 600; font-family: var(--font-display); }
        .vreedits-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; pointer-events: none;
          transition: opacity 0.25s ease; z-index: 40;
        }
        .vreedits-overlay.open { opacity: 1; pointer-events: auto; }
        .vreedits-menu {
          position: fixed; top: 0; left: 0; bottom: 0; width: min(320px, 86vw);
          background: var(--surface); border-right: 1px solid var(--border);
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
          display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px 12px; border-radius: 10px;
          border: none; background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 500;
          cursor: pointer; margin-bottom: 2px; text-align: left;
        }
        .vreedits-nav-item:hover { background: var(--surface-2); color: var(--text); }
        .vreedits-nav-item.active { background: var(--accent-soft); color: var(--accent); }
        .vreedits-nav-item.locked { opacity: 0.4; cursor: not-allowed; }
        .vreedits-lock-badge { margin-left: auto; }
        .vreedits-content { flex: 1; min-height: 0; overflow-y: auto; }
      `}</style>

      <div className="vreedits-topbar">
        <button ref={hamburgerRef} className="vreedits-hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <span className="vreedits-brand">Vreedits</span>
        <div style={{ width: 42 }} />
      </div>

      <div className={`vreedits-overlay ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />

      <nav ref={menuRef} className={`vreedits-menu ${menuOpen ? "open" : ""}`}>
        <button className="vreedits-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <X size={17} />
        </button>

        <div className="vreedits-profile-block">
          <div style={{ position: "relative" }} ref={profileRef}>
            <div className="vreedits-avatar-wrap" onClick={() => setProfileMenuOpen((v) => !v)}>
              {user?.avatarDataUrl ? (
                <img className="vreedits-avatar" src={user.avatarDataUrl} alt="Profile" />
              ) : (
                <div className="vreedits-avatar">{(user?.displayName || user?.username)?.slice(0, 2).toUpperCase()}</div>
              )}
              <span className={`vreedits-status-dot ${user?.online ? "online" : "offline"}`} />
            </div>
            <div className="vreedits-name-row" onClick={() => setProfileMenuOpen((v) => !v)}>
              <span className="vreedits-display-name">{user?.displayName || user?.username}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 1 }}>
              @{user?.username?.toLowerCase()}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
              {user?.online ? "Online" : "Offline"}
            </div>

            <div className={`vreedits-popover-panel ${profileMenuOpen ? "open" : ""}`}>
              <Link href="/profile" className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <User size={15} /> View Profile
              </Link>
              <Link href="/profile" className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <User size={15} /> Edit Profile
              </Link>
              <Link href={popoverSettingsHref} className="vreedits-popover-item" onClick={() => setProfileMenuOpen(false)}>
                <Settings size={15} /> Settings
              </Link>
              <button className="vreedits-popover-item danger" onClick={handleLogout}>
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </div>

        <div className="vreedits-nav-scroll">
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item);
            if (!item.available) {
              return (
                <div key={item.id} className="vreedits-nav-item locked" title="Coming in a later phase">
                  <item.icon size={17} />
                  {item.label}
                  <Lock size={13} className="vreedits-lock-badge" />
                </div>
              );
            }
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`vreedits-nav-item ${isActive ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <item.icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="vreedits-content">{children}</div>
    </div>
  );
}
