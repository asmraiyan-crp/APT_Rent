import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Home,
  MessageSquare,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  X,
  CheckCheck,
  FileText,
  FileSignature,
  Calendar,
  Pencil,
  Heart,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { logoutUser } from "../utils/auth";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { localizeNotification } from "../utils/notificationText.js";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";

// =============================================================================
// AppNavbar.jsx — Unified role-aware navigation bar
// =============================================================================
// Features:
//   • Role switcher pill (Tenant / Landlord / Admin)
//   • Notification bell with unread badge + dropdown
//   • User avatar + profile dropdown
//   • Role-specific nav links
//   • Language switcher (EN | BN)
//   • Fully mobile responsive (hamburger for sm/md)
// =============================================================================

// NOTE: `label` is now a translation key, rendered with t(label)
const navLinks = {
  tenant: [
    { label: "nav.dashboard", to: "/tenant", icon: LayoutDashboard },
    { label: "nav.browse", to: "/dashboard", icon: Home },
    { label: "nav.applications", to: "/applications", icon: FileText },
    { label: "nav.contracts", to: "/contracts", icon: FileSignature },
    { label: "nav.inbox", to: "/inbox", icon: MessageSquare },
    { label: "nav.payRent", to: "/rent", icon: CreditCard },
  ],
  landlord: [
    { label: "nav.dashboard", to: "/landlord", icon: LayoutDashboard },
    { label: "nav.tourRequests", to: "/tour-requests", icon: Calendar },
    { label: "nav.contracts", to: "/contracts", icon: FileSignature },
    { label: "nav.inbox", to: "/inbox", icon: MessageSquare },
    { label: "nav.browse", to: "/dashboard", icon: Home },
  ],
  admin: [
    { label: "nav.adminPanel", to: "/admin", icon: ShieldCheck },
    { label: "nav.browse", to: "/dashboard", icon: Home },
    { label: "nav.inbox", to: "/inbox", icon: MessageSquare },
  ],
};

const roleLabelKeys = { tenant: "role.tenant", landlord: "role.landlord", admin: "role.admin" };

// function timeAgo(iso, t) {
//   const diff = Date.now() - new Date(iso).getTime();
//   const m = Math.floor(diff / 60000);
//   if (m < 1) return t("time.justNow");
//   if (m < 60) return t("time.m", { n: m });
//   const h = Math.floor(m / 60);
//   if (h < 24) return t("time.h", { n: h });
//   return t("time.d", { n: Math.floor(h / 24) });
// }

function notificationDestination(notification, role) {
  const link = notification?.link;
  if (!link || !link.startsWith("/")) {
    return role === "landlord" ? "/landlord" : "/inbox";
  }

  if (link === "/notifications") return role === "landlord" ? "/landlord" : "/inbox";
  if (link.startsWith("/applications/")) return role === "landlord" ? "/landlord?tab=applications" : "/applications";
  if (link === "/appointments" || link.startsWith("/appointments/")) {
    return role === "landlord" ? "/tour-requests" : "/dashboard";
  }
  if (link.startsWith("/landlord/")) return "/landlord";
  if (link.startsWith("/admin/")) return "/admin";
  if (link.startsWith("/disputes/")) return "/admin";
  if (link.startsWith("/users/")) return "/profile";
  if (link.startsWith("/conversations/")) return "/inbox";
  return link;
}

export default function AppNavbar() {
  const { role, currentUser, authReady, notifications, unreadCount, messageUnreadCount, switchRole, markNotificationRead, markAllNotificationsRead, clearSession } = useApp();
  const isAuthenticated = Boolean(currentUser);
  const isGuest = authReady && !currentUser; // settled AND signed out
  const isDualRole = Boolean(currentUser?.isLandlord && currentUser?.isTenant);
  const isAdmin = Boolean(currentUser?.isAdmin);
  const navigate = useNavigate();
  const location = useLocation();
  //  const { t, timeAgo } = useLanguage();
  const i18n = useLanguage();
  const { t, timeAgo } = i18n;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutUser();
    } finally {
      clearSession();
      setUserMenuOpen(false);
      setIsLoggingOut(false);
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the mobile menu on route change; deliberate.
    setMobileOpen(false);
  }, [location.pathname]);

  const guestLinks = [{ label: "nav.browse", to: "/dashboard", icon: Home }];
  const links = isAuthenticated ? (navLinks[role] ?? navLinks.tenant) : guestLinks;
  const initials =
    currentUser?.name
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase() ?? "U";

  return (
    <>
    <header className="app-navbar">
      <div className="app-navbar-inner">
        <Link to="/" className="app-navbar-brand">
          <img src="/assets/images/logo/apt-rent-logo.png" alt="APT Rent" className="app-navbar-logo" />
        </Link>

        <nav className="app-nav-links" aria-label={t("nav.mainNavigation")}>
          {links.map(({ label, to, icon: Icon }) => {
            const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
            const showMessageBadge = to === "/inbox" && messageUnreadCount > 0;
            return (
              <Link key={to} to={to} className={`app-nav-link ${isActive ? "is-active" : ""}`}>
                <Icon size={16} />
                {t(label)}
                {showMessageBadge && (
                  <span className="notif-count">{messageUnreadCount > 9 ? "9+" : messageUnreadCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="app-navbar-actions">
          {/* ===== GUEST: register + login + language switcher ===== */}
          {isGuest && (
            <div className="guest-auth-actions">
              {location.pathname !== "/register" && (
                <Link to="/register" className="guest-register-link">{t("auth.register")}</Link>
              )}
              {location.pathname !== "/login" && (
                <Link to="/login" className="btn btn-primary guest-login-btn">{t("auth.login")}</Link>
              )}
              {/* Language switcher — right next to "Log in" */}
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          )}

          {/* ===== LOGGED IN: language + role switcher + bell + avatar menu ===== */}
          {isAuthenticated && (
            <>
              {/* Language switcher — beside bell + user menu */}
              <LanguageSwitcher />
              <ThemeToggle />

              {/* Role switcher — only for accounts that really are both.
                  A tenant-only or landlord-only user has nothing to switch
                  between, and offering it let anyone impersonate the other
                  side just by clicking. */}
              {(isDualRole || isAdmin) && (
                <div className="role-switch">
                  {isDualRole && ["tenant", "landlord"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        if (role !== r) {
                          switchRole(r);
                          navigate(r === "landlord" ? "/landlord" : "/dashboard");
                        }
                      }}
                      className={`role-switch-btn ${role === r ? "is-active" : ""}`}
                    >
                      {t(roleLabelKeys[r])}
                    </button>
                  ))}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        switchRole("admin");
                        navigate("/admin");
                      }}
                      className={`role-switch-btn ${role === "admin" ? "is-active" : ""}`}
                      title={t("role.admin")}
                    >
                      {t("role.admin")}
                    </button>
                  )}
                </div>
              )}

              {/* Notifications */}
              <div className="app-navbar-menu-wrapper" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((o) => !o);
                    setUserMenuOpen(false);
                  }}
                  className="icon-btn"
                  aria-label={`${t("notif.title")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                >
                  <Bell size={19} />
                  {unreadCount > 0 && <span className="notif-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>

                {notifOpen && (
                  <div className="app-dropdown notif-dropdown" role="menu">
                    <div className="app-dropdown-header">
                      <h3>{t("notif.title")}</h3>
                      {unreadCount > 0 && (
                        <button type="button" className="dropdown-link" onClick={markAllNotificationsRead}>
                          <CheckCheck size={13} /> {t("notif.markAllRead")}
                        </button>
                      )}
                    </div>

                    <ul className="notif-list">
                      {notifications.length === 0 ? (
                        <li className="notif-empty">{t("notif.empty")}</li>
                      ) : (
                        notifications.slice(0, 5).map((n) => {
                          const text = localizeNotification(n, i18n);

                          return (
                            <li key={n.id}>
                              <button
                                type="button"
                                className={`notif-item ${!n.isRead ? "is-unread" : ""}`}
                                onClick={() => {
                                  markNotificationRead(n.id);
                                  setNotifOpen(false);
                                  navigate(notificationDestination(n, role));
                                }}
                              >
                                {!n.isRead && <span className="notif-dot" />}
                                <span className="notif-item-body">
                                  {/* <span className="notif-item-title">{n.title}</span> */}
                                  {/* <span className="notif-item-message">{n.message}</span> */}
                                   <span className="notif-item-title">{text.title}</span>
                                   <span className="notif-item-message">{text.message}</span>
                                  <span className="notif-item-time">
                                    {timeAgo(n.timestamp, { style: "short" })}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                    <Link to="/notifications" className="notif-view-all" onClick={() => setNotifOpen(false)}>{t("notif.viewAll")}</Link>

                    {notifications.length > 0 && (
                      <div className="app-dropdown-footer">
                        <button
                          type="button"
                          className="dropdown-link"
                          onClick={() => {
                            setNotifOpen(false);
                            // Tour requests are the one notification type with
                            // a page of its own; everything else is either
                            // handled in place or has no inbox yet. Sending
                            // users to /inbox for all of them was simply wrong.
                            navigate(role === "landlord" ? "/tour-requests" : "/inbox");
                          }}
                        >
                          {role === "landlord" ? t("notif.viewTours") : t("notif.goInbox")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* User menu */}
              <div className="app-navbar-menu-wrapper" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen((o) => !o);
                    setNotifOpen(false);
                  }}
                  className="user-chip-btn"
                  aria-label={t("user.menu")}
                >
                  <span className="user-chip-avatar">
                    {currentUser?.profilePictureUrl ? (
                      <img src={currentUser.profilePictureUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      initials
                    )}
                  </span>
                  <span className="user-chip-name">{currentUser?.name?.split(" ")[0]}</span>
                  <ChevronDown size={14} />
                </button>

                {userMenuOpen && (
                  <div className="app-dropdown user-dropdown" role="menu">
                    <div className="user-dropdown-header">
                      <p className="user-dropdown-name">{currentUser?.name}</p>
                      <p className="user-dropdown-email">{currentUser?.email}</p>
                      <span className="badge badge-neutral">{t(roleLabelKeys[role])}</span>
                    </div>
                    <Link to={`/users/${currentUser?.id}`} className="app-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                      <User size={15} /> {t("user.viewProfile")}
                    </Link>
                    <Link to="/profile" className="app-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                      <Pencil size={15} /> {t("user.editProfile")}
                    </Link>
                    <Link to="/inbox" className="app-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                      <MessageSquare size={15} /> {t("user.inbox")}
                    </Link>
                    {role === "tenant" && (
                      <Link to="/saved" className="app-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Heart size={15} /> {t("nav.saved")}
                      </Link>
                    )}
                    <button
                      type="button"
                      className="app-dropdown-item is-danger"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                    >
                      <LogOut size={15} /> {t("user.logout")}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mobile toggle */}
          <button
            type="button"
            className="icon-btn mobile-toggle"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={t("mobile.toggle")}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="app-mobile-menu">
          <nav>
            {links.map(({ label, to, icon: Icon }) => {
              const isActive = location.pathname === to;
              const showMessageBadge = to === "/inbox" && messageUnreadCount > 0;
              return (
                <Link key={to} to={to} className={`app-nav-link ${isActive ? "is-active" : ""}`}>
                  <Icon size={17} />
                  {t(label)}
                  {showMessageBadge && (
                    <span className="notif-count">{messageUnreadCount > 9 ? "9+" : messageUnreadCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          {isGuest && (
            <div className="app-mobile-guest-actions">
              <Link to="/login" className="btn btn-primary">{t("auth.login")}</Link>
              <Link to="/register" className="btn btn-ghost">{t("auth.register")}</Link>
            </div>
          )}
          {(isDualRole || isAdmin) && (
            <div className="app-mobile-role-switch">
              <p className="app-mobile-role-label">{t("role.switch")}</p>
              <div className="role-switch role-switch-block">
                {[...(isDualRole ? ["tenant", "landlord"] : []), ...(isAdmin ? ["admin"] : [])].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`role-switch-btn ${role === r ? "is-active" : ""}`}
                    onClick={() => {
                      switchRole(r);
                      navigate(r === "landlord" ? "/landlord" : r === "admin" ? "/admin" : "/dashboard");
                    }}
                  >
                    {t(roleLabelKeys[r])}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
    <Breadcrumbs />
    </>
  );
}