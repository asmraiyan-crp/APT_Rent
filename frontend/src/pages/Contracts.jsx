/**
 * ============================================================================
 * Contracts.jsx — "the contract bar"
 * ============================================================================
 * CHANGED from your version:
 *   1. Each row in the list now also shows a transaction id and a Yes/No
 *      payment-status badge — both come straight from listContracts()'s new
 *      transaction_id / payment_status fields (contractController.js).
 *   2. The expanded "View details" panel now has a Lease Document section:
 *      an embedded PDF preview (<iframe>) plus a Download button, pointed
 *      at contract.contract_pdf_url.
 * Everything else (the fetch-on-open accordion pattern, signature display,
 * loading/error states) is exactly what you already had.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronDown, ChevronUp, Clock, PenLine, Download, Receipt } from "lucide-react";
import AppNavbar from "../components/AppNavbar.jsx";
import api from "../services/api";
import { formatDateLong } from "../utils/tour.js";
import { useApp } from "../context/AppContext.jsx";
import "../css/global.css";
import "../css/navbar.css";
import "../css/modules.css";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const STATUS_BADGE = {
  draft: "badge-warn",
  signed_by_owner: "badge-warn",
  signed_by_tenant: "badge-warn",
  fully_signed: "badge-ink",
  active: "badge-success",
};



export default function Contracts() {
  const { currentUser } = useApp();
  const { t, tx, lang, formatCurrency, digits } = useLanguage();
  const [contracts, setContracts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [negotiation, setNegotiation] = useState({});
  const [negotiationError, setNegotiationError] = useState({});
  const [acceptError, setAcceptError] = useState({});
  const [signatureBusy, setSignatureBusy] = useState({});
  const [signatureError, setSignatureError] = useState({});

  useEffect(() => {
    let cancelled = false;

    // GET /contracts — both parties of a lease land here: the query
    // matches on owner_id OR tenant_id, so one page serves either side.
    // Each row now also carries transaction_id / payment_status / contract_pdf_url.
    api.contracts
      .list()
      .then((data) => {
        if (cancelled) return;
        setContracts(data?.data ?? []);
        setLoadError("");
      })
      .catch((error) => {
        if (!cancelled) {
          setContracts([]);
          setLoadError(error.message || "__default__");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (contractId) => {
    if (openId === contractId) {
      setOpenId(null);
      return;
    }
    setOpenId(contractId);
    if (!details[contractId]) {
      api.contracts
        .getById(contractId)
        .then((contract) => setDetails((prev) => ({ ...prev, [contractId]: contract })))
        .catch(() => setDetails((prev) => ({ ...prev, [contractId]: null })));
    }
  };

  const counterparty = (contract) => {
    const isMine = String(contract.owner?.user_id) === String(currentUser?.id);
    return isMine
      ? { label: t("contracts.tenant"), name: contract.tenant?.name ?? t("contracts.tenant") }
      : { label: t("contracts.landlord"), name: contract.owner?.name ?? t("contracts.landlord") };
  };

  const submitNegotiation = async (contract) => {
    const values = negotiation[contract.contract_id] ?? {};
    const rate = values.rate ?? details[contract.contract_id]?.rate ?? contract.rate;
    const deposit = values.deposit ?? details[contract.contract_id]?.deposit ?? contract.deposit;
    const numericRate = Number(rate);
    const numericDeposit = Number(deposit);

    if (!Number.isFinite(numericRate) || numericRate <= 0 || !Number.isFinite(numericDeposit) || numericDeposit < 0) {
      setNegotiationError((prev) => ({
        ...prev,
        [contract.contract_id]: "Enter a valid rent and non-negative deposit.",
      }));
      return;
    }

    try {
      setNegotiationError((prev) => ({ ...prev, [contract.contract_id]: "" }));
            const updated = await api.contracts.negotiate(contract.contract_id, {
        // Untouched inputs only display the contract's value; fall back to it.
        rate: values.rate ?? contract.rate,
        deposit: values.deposit ?? contract.deposit,
        message: values.message,
      });
      setContracts((prev) => prev.map((item) =>
        item.contract_id === contract.contract_id
          ? { ...item, rate: updated.rate, deposit: updated.deposit, negotiation_status: updated.negotiation_status }
          : item,
      ));
      setDetails((prev) => ({
        ...prev,
        [contract.contract_id]: { ...prev[contract.contract_id], ...updated },
      }));
    } catch (error) {
      setNegotiationError((prev) => ({
        ...prev,
        [contract.contract_id]: error.response?.data?.message || error.message || t("contracts.submitFailed"),
      }));
    }
  };

  const acceptContract = async (contract) => {
    try {
      setAcceptError((prev) => ({ ...prev, [contract.contract_id]: "" }));
      const updated = await api.contracts.accept(contract.contract_id);
      setContracts((prev) => prev.map((item) =>
        item.contract_id === contract.contract_id
          ? { ...item, negotiation_status: updated.negotiation_status }
          : item,
      ));
      setDetails((prev) => ({
        ...prev,
        [contract.contract_id]: { ...prev[contract.contract_id], ...updated },
      }));
    } catch (error) {
      setAcceptError((prev) => ({
        ...prev,
        [contract.contract_id]: error.response?.data?.message || error.message || t("contracts.acceptFailed"),
      }));
    }
  };

  const uploadSignature = (contract) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setSignatureBusy((prev) => ({ ...prev, [contract.contract_id]: true }));
          setSignatureError((prev) => ({ ...prev, [contract.contract_id]: "" }));
          const updated = await api.contracts.sign(contract.contract_id, reader.result);
          setDetails((prev) => ({ ...prev, [contract.contract_id]: { ...prev[contract.contract_id], ...updated } }));
          setContracts((prev) => prev.map((item) => item.contract_id === contract.contract_id ? { ...item, status: updated.status } : item));
        } catch (error) {
          setSignatureError((prev) => ({ ...prev, [contract.contract_id]: error.message || t("contracts.signatureFailed") }));
        } finally {
          setSignatureBusy((prev) => ({ ...prev, [contract.contract_id]: false }));
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="module-shell">
      <AppNavbar />

      <main className="module-main">
        <div style={{ marginBottom: "2rem" }}>
          <span className="eyebrow">{t("contracts.eyebrow")}</span>
          <h1 className="module-title">{t("contracts.title")}</h1>
          <p className="module-subtitle">{t("contracts.subtitle")}</p>
        </div>

        {loadError && (
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              color: "var(--color-blueprint)",
              background: "var(--color-paper-dim)",
              border: "1px dashed var(--color-line-strong)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              marginBottom: "1.5rem",
            }}
          >
            {loadError === "__default__" ? t("contracts.loadError") : loadError}
          </p>
        )}

        {contracts.length === 0 ? (
          <div className="mod-card mod-card-pad" style={{ textAlign: "center", color: "var(--color-charcoal)" }}>
            <FileText size={28} style={{ color: "var(--color-line-strong)", margin: "0 auto 12px" }} />
            <p>{t("contracts.empty")}</p>
            <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: "1rem", display: "inline-flex" }}>
              {t("common.browseListings")}
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {contracts.map((contract) => {
              const isOpen = openId === contract.contract_id;
              const detail = details[contract.contract_id];
              const other = counterparty(contract);
              const isOwner = String(contract.owner?.user_id) === String(currentUser?.id);
              // These two fields come straight off the list row — see
              // "transaction id / payment status yes-no" in the ask.
              const transactionId = contract.transaction_id;
              const isPaid = contract.payment_status === "yes";

              return (
                <div key={contract.contract_id} className="mod-card mod-card-pad">
                  <button
                    onClick={() => toggle(contract.contract_id)}
                    style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                  >
                    <div style={{ flex: "1 1 220px" }}>
                      <Link
                        to={`/property/${contract.property_id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 600, color: "var(--color-text-strong)", fontFamily: "var(--font-display)" }}
                      >
                        {contract.property_address}
                      </Link>
                      <p style={{ fontSize: "0.82rem", color: "var(--color-blueprint)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={13} /> {t("contracts.contractNo", { id: digits(contract.contract_id) })} · {other.label}: {other.name}
                      </p>
                    </div>

                    {/* --- NEW: transaction id + Yes/No payment badge --- */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.72rem",
                          color: "var(--color-blueprint)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Receipt size={12} /> {transactionId ? t("contracts.txn", { id: transactionId }) : t("contracts.noTxn")}
                      </span>
                      <span className={`badge ${isPaid ? "badge-success" : "badge-warn"}`}>
                        {t("contracts.payment", { value: isPaid ? t("common.yes") : t("common.no") })}
                      </span>
                    </div>

                    <span className={`badge ${STATUS_BADGE[contract.status] ?? "badge-neutral"}`}>
                      {contract.negotiation_status === "accepted" && contract.status === "draft"
                        ? t("contracts.leaseAccepted")
                        : contract.negotiation_status === "proposed"
                          ? t("contracts.proposalSent")
                          : tx("contracts.status", contract.status)}
                    </span>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--color-line)", marginTop: "1rem", paddingTop: "1rem" }}>
                      {detail === undefined ? (
                        <p style={{ color: "var(--color-charcoal)", fontSize: "0.9rem" }}>{t("contracts.loadingContract")}</p>
                      ) : detail === null ? (
                        <p style={{ color: "var(--color-error)", fontSize: "0.9rem" }}>
                          {t("contracts.loadDetailFailed")}
                        </p>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                            {[
                              { label: t("contracts.monthlyRent"), value: formatCurrency(contract.rate ?? 0) },
                              { label: t("contracts.securityDeposit"), value: formatCurrency(contract.deposit ?? 0) },
                              { label: t("contracts.startDate"), value: formatDateLong(contract.start_date, lang) },
                              { label: t("contracts.endDate"), value: formatDateLong(contract.end_date, lang) },
                            ].map((item) => (
                              <div key={item.label}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-blueprint)", display: "block" }}>{item.label}</span>
                                <span style={{ color: "var(--color-charcoal)", fontWeight: 600, fontSize: "0.9rem" }}>{item.value}</span>
                              </div>
                            ))}
                          </div>

                          {contract.status === "draft" && (!isOwner || detail.negotiation_status === "proposed") && (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                submitNegotiation(contract);
                              }}
                              style={{ borderTop: "1px solid var(--color-line)", paddingTop: "1rem", marginBottom: "1rem" }}
                            >
                              <strong style={{ display: "block", marginBottom: "0.75rem", color: "var(--color-text-strong)" }}>
                                {t("contracts.bargainTitle")}
                              </strong>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                                <label>
                                  <span className="eyebrow">{t("contracts.monthlyRentLabel")}</span>
                                  <input type="number" min="1" value={negotiation[contract.contract_id]?.rate ?? contract.rate ?? ""} onChange={(event) => setNegotiation((prev) => ({ ...prev, [contract.contract_id]: { ...prev[contract.contract_id], rate: event.target.value } }))} />
                                </label>
                                <label>
                                  <span className="eyebrow">{t("contracts.securityDepositLabel")}</span>
                                  <input type="number" min="0" value={negotiation[contract.contract_id]?.deposit ?? contract.deposit ?? ""} onChange={(event) => setNegotiation((prev) => ({ ...prev, [contract.contract_id]: { ...prev[contract.contract_id], deposit: event.target.value } }))} />
                                </label>
                              </div>
                              <textarea placeholder={isOwner ? t("contracts.messageToTenant") : t("contracts.messageToLandlord")} value={negotiation[contract.contract_id]?.message ?? ""} onChange={(event) => setNegotiation((prev) => ({ ...prev, [contract.contract_id]: { ...prev[contract.contract_id], message: event.target.value } }))} style={{ width: "100%", marginTop: "0.75rem", minHeight: "70px" }} />
                              <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>{isOwner ? t("contracts.sendCounter") : t("contracts.sendProposal")}</button>
                              {negotiationError[contract.contract_id] && <p role="alert" style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{negotiationError[contract.contract_id]}</p>}
                              {detail.negotiation_status === "proposed" && <p style={{ color: "var(--color-blueprint)", marginTop: "0.5rem" }}>{t("contracts.proposalSentNote")}</p>}
                              {detail.negotiation_status === "proposed" && (
                                <button type="button" className="btn btn-primary" onClick={() => acceptContract(contract)} style={{ marginTop: "0.75rem" }}>
                                  {isOwner ? t("contracts.acceptTenantProposal") : t("contracts.acceptTerms")}
                                </button>
                              )}

                              {acceptError[contract.contract_id] && <p role="alert" style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{acceptError[contract.contract_id]}</p>}
                            </form>
                          )}

                          {detail.negotiation_status === "accepted" && (
                            <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: "1rem", marginBottom: "1rem" }}>
                              <strong style={{ display: "block", marginBottom: "0.5rem", color: "var(--color-text-strong)" }}>{t("contracts.signTitle")}</strong>
                              <p style={{ color: "var(--color-charcoal)", fontSize: "0.85rem" }}>
                                {t("contracts.signHelp")}
                              </p>
                              {((isOwner && !detail.owner_signature_url) || (!isOwner && !detail.tenant_signature_url)) && (
                                <button type="button" className="btn btn-primary" disabled={signatureBusy[contract.contract_id]} onClick={() => uploadSignature(contract)}>
                                  {signatureBusy[contract.contract_id] ? t("contracts.uploading") : t("contracts.uploadSignature")}
                                </button>
                              )}
                              {signatureError[contract.contract_id] && <p role="alert" style={{ color: "var(--color-error)" }}>{signatureError[contract.contract_id]}</p>}
                            </div>
                          )}
                          {detail.negotiation_status === "accepted" && <p style={{ color: "var(--color-success)", marginTop: "0.5rem" }}>{t("contracts.acceptedNote")}</p>}

                          {detail.terms_and_conditions && (
                            <div style={{ marginBottom: "1rem" }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-blueprint)", display: "block", marginBottom: "4px" }}>{t("contracts.terms")}</span>
                              <p style={{ color: "var(--color-charcoal)", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>{detail.terms_and_conditions}</p>
                            </div>
                          )}

                          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                            {[
                              { label: t("contracts.landlordSignature"), url: detail.owner_signature_url },
                              { label: t("contracts.tenantSignature"), url: detail.tenant_signature_url },
                            ].map((sig) => (
                              <div key={sig.label}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-blueprint)", display: "block", marginBottom: "4px" }}>{sig.label}</span>
                                {sig.url ? (
                                  <img src={sig.url} alt={sig.label} style={{ maxHeight: "56px", border: "1px solid var(--color-line)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--color-charcoal)", fontSize: "0.85rem" }}>
                                    <PenLine size={13} /> {t("contracts.notSigned")}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* =================== NEW: Lease Document (PDF) =================== */}
                          <div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-blueprint)", display: "block", marginBottom: "8px" }}>
                              {t("contracts.leaseDocument")}
                            </span>

                            {detail.contract_pdf_url ? (
                              <>
                                <div
                                  style={{
                                    border: "1px solid var(--color-line)",
                                    borderRadius: "var(--radius-sm)",
                                    overflow: "hidden",
                                    height: "420px",
                                    marginBottom: "10px",
                                  }}
                                >
                                  {/* Browser's built-in PDF viewer renders this inline. */}
                                  <iframe
                                    src={detail.contract_pdf_url}
                                    title={t("contracts.pdfTitle", { id: digits(contract.contract_id) })}
                                    style={{ width: "100%", height: "100%", border: "none" }}
                                  />
                                </div>
                                <a
                                  href={detail.contract_pdf_url}
                                  download={`lease-contract-${contract.contract_id}.pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-primary"
                                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                                >
                                  <Download size={16} /> {t("contracts.downloadPdf")}
                                </a>
                              </>
                            ) : (
                              <p style={{ color: "var(--color-charcoal)", fontSize: "0.85rem" }}>
                                {t("contracts.pdfPending")}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>{t("footer.brand")}</p>
        </div>
      </footer>
    </div>
  );
}