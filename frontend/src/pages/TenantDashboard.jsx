import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Home, Search } from "lucide-react";
import AppNavbar from "../components/AppNavbar.jsx";
import api from "../services/api";
import { useApp } from "../context/AppContext.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import "../css/global.css";
import "../css/navbar.css";
import "../css/modules.css";

const PILL = { pending: "pill-muted", paid: "pill-done", due: "pill-open", overdue: "pill-danger" };

export default function TenantDashboard() {
  const { t, formatCurrency, formatDate, formatNumber } = useLanguage();
  const { currentUser } = useApp();
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    api.tenant.dashboard()
      .then((res) => { if (!cancelled) setState({ loading: false, data: res?.data ?? null }); })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null }); });
    return () => { cancelled = true; };
  }, []);

  const d = state.data;
  const month = (ym) => formatDate(`${ym}-01T00:00:00`, "monthYear");

  return (
    <div className="module-shell">
      <AppNavbar />
      <main className="module-main module-main-wide">
        <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>{t("dash.eyebrow")}</span>
        <h1 className="module-title">{t("dash.welcome", { name: currentUser?.name ?? "" })}</h1>

        {state.loading ? <p className="fx-help">{t("common.loading")}</p> : !d ? (
          <div className="fx-empty mod-card" style={{ marginTop: "1.5rem" }}>
            <Home size={44} aria-hidden="true" />
            <h2>{t("dash.noProperty")}</h2>
            <p>{t("dash.noPropertyBody")}</p>
            <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 14 }}><Search size={15} /> {t("saved.browse")}</Link>
          </div>
        ) : (
          <>
            <div className="td-grid" style={{ marginTop: "1.5rem" }}>
              <section className="mod-card mod-card-pad">
                <span className="fx-label">{t("dash.myProperty")}</span>
                <h2 style={{ fontSize: "1.1rem", margin: "6px 0" }}><Link to={`/property/${d.property.property_id}`}>{d.property.address}</Link></h2>
                <p className="fx-help">{t("dash.landlord")}: {d.landlord}</p>
                {d.lease.start_date && <p className="fx-help">{t("dash.leaseTerm", { from: formatDate(`${d.lease.start_date}T00:00:00`, "medium"), to: formatDate(`${d.lease.end_date}T00:00:00`, "medium") })}</p>}
                <p style={{ marginTop: 8 }}><strong>{formatCurrency(d.lease.rate)}</strong> {t("dash.perMonth")}</p>
                <Link to="/contracts" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>{t("dash.viewLease")}</Link>
              </section>

              <section className="mod-card mod-card-pad">
                <span className="fx-label">{t("dash.thisMonth")} · {month(d.current_month.month)}</span>
                <p className="td-big">{formatCurrency(d.lease.rate)}</p>
                <span className={`pill ${PILL[d.current_month.status]}`}>{t(`dash.status.${d.current_month.status}`)}</span>
                {d.current_month.status !== "paid" && <p className="fx-help" style={{ marginTop: 8 }}>{t("dash.dueBy", { date: formatDate(`${d.current_month.due_by}T00:00:00`, "long") })}</p>}
                <br /><Link to="/rent" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>{t("nav.payRent")}</Link>
              </section>

              <section className="mod-card mod-card-pad">
                <span className="fx-label">{t("dash.rentDue")}</span>
                <p className="td-big">{formatCurrency(d.total_due)}</p>
                <p className="fx-help">{d.months_due_count === 0 ? t("dash.allPaid") : t("dash.monthsDue", { count: d.months_due_count, n: formatNumber(d.months_due_count) })}</p>
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: "0.85rem", color: "var(--color-charcoal)" }}>
                  {d.months_due.slice(-6).map((m) => <li key={m.month}>{month(m.month)} — {formatCurrency(m.amount)}</li>)}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="site-footer"><div className="container"><p>{t("footer.brand")}</p></div></footer>
    </div>
  );
}