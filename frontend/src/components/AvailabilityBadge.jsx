import { useLanguage } from "../i18n/LanguageContext.jsx";

const TONE = { available: "pill-done", rented: "pill-danger", unavailable: "pill-muted", archived: "pill-muted" };

/** Shows whether a listing is free or taken, so tenants, landlords and admins can tell at a glance. */
export default function AvailabilityBadge({ status }) {
  const { t } = useLanguage();
  if (!status) return null;
  return <span className={`pill ${TONE[status] ?? "pill-muted"}`}>{t(`availability.${status}`)}</span>;
}