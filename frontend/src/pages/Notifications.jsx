import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import AppNavbar from "../components/AppNavbar.jsx";
import api from "../services/api";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import "../css/global.css";
import "../css/navbar.css";
import "../css/modules.css";

export default function Notifications() {
  const { t, formatDate, formatClock } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    api.notifications.list()
      .then((res) => { if (!cancelled) setItems(res?.data ?? []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  const markAll = () => api.notifications.markAllRead().then(() => setItems((l) => l.map((n) => ({ ...n, is_read: true })))).catch(() => {});
  const open = (n) => {
    if (!n.is_read) {
      api.notifications.markRead(n.notification_id).catch(() => {});
      setItems((l) => l.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)));
    }
    if (n.link_url && n.link_url.startsWith("/") && n.link_url !== "/notifications") navigate(n.link_url);
  };
  const shown = (items ?? []).filter((n) => filter === "all" || !n.is_read);
  const unread = (items ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="module-shell">
      <AppNavbar />
      <main className="module-main">
        <h1 className="module-title">{t("notif.pageTitle")}</h1>
        <div className="fx-actions" style={{ margin: "1rem 0", justifyContent: "space-between" }}>
          <div className="mt-filter">
            {["all", "unread"].map((k) => (
              <button key={k} type="button" className={`pill-tab ${filter === k ? "is-active" : ""}`} onClick={() => setFilter(k)}>
                {t(`notif.filter.${k}`)}{k === "unread" && ` (${unread})`}
              </button>
            ))}
          </div>
          {unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}><CheckCheck size={14} /> {t("notif.markAllRead")}</button>}
        </div>
        <div className="mod-card">
          {items === null ? <p className="fx-help" style={{ padding: 16 }}>{t("common.loading")}</p>
            : shown.length === 0 ? <p className="fx-help" style={{ padding: 16 }}>{t("notif.empty")}</p>
            : shown.map((n) => (
              <button key={n.notification_id} type="button" className={`np-item ${n.is_read ? "is-read" : ""}`} onClick={() => open(n)}>
                <span className="np-dot" aria-hidden="true" />
                <span><span className="np-title">{n.title}</span><br />{n.message}<br />
                  <span className="np-time">{formatDate(n.created_at, "medium")} · {formatClock(n.created_at)}</span></span>
              </button>
            ))}
        </div>
      </main>
      <footer className="site-footer"><div className="container"><p>{t("footer.brand")}</p></div></footer>
    </div>
  );
}