import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNavbar from "../components/AppNavbar.jsx";
import { loginUser } from "../utils/auth";
import { useApp } from "../context/AppContext.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export default function Login() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { applyAuthenticatedUser } = useApp();

  // RequireAuth records the page the visitor was trying to reach, so
  // signing in from a guarded page returns them there instead of
  // stranding them on the dashboard.
  //
  // The search string has to come along: "Contact Landlord" sends
  // people to /inbox?contact=<landlord>&property=<id>, and those params
  // are what open the thread. The path alone would drop them and land
  // on an empty inbox.

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // The server sets an httpOnly cookie we can't read, so context has to
      // be told explicitly — otherwise currentUser stays null and
      // RequireAuth bounces straight back here.
      const user = await loginUser(email, password);
      applyAuthenticatedUser(user);
      // Always land on the role's own home (not the last page browsed).
      const home = user?.isAdmin ? "/admin" : user?.isLandlord ? "/landlord" : "/tenant";
      navigate(home, { replace: true });
    } catch (err) {
      setError(err.message || t("login.genericError"));
    }
  };

  return (
    <div className="page-shell">
      <AppNavbar />

      {/* AUTH LAYOUT (left brand + right form) */}
      <main className="auth-shell">
        <section className="auth-brand">
          <a href="/" className="brand">
            <img
              src="/assets/images/logo/apt-rent-logo.png"
              alt="APT Rent logo"
              className="brand-logo"
            />
            <span className="brand-name">
              APT<span> Rent</span>
            </span>
          </a>

          <div className="auth-brand-copy">
            <span className="eyebrow">{t("login.welcome")}</span>

            <h2>{t("login.tagline")}</h2>

            <p>{t("login.intro")}</p>

            <ul className="auth-brand-list">
              <li>{t("login.bullet1")}</li>
              <li>{t("login.bullet2")}</li>
              <li>{t("login.bullet3")}</li>
            </ul>
          </div>

          <p className="auth-brand-foot">{t("login.brandFoot")}</p>
        </section>

        <section className="auth-form-panel">
          <div className="auth-card corner-marks">
            <header>
              <span className="eyebrow">{t("login.eyebrow")}</span>

              <h1>{t("login.title")}</h1>

              <p>{t("login.subtitle")}</p>
            </header>

            <form
              id="loginForm"
              className="form-grid"
              onSubmit={handleLogin}
              noValidate
            >
              <div className="field" data-field="email">
                <label htmlFor="loginEmail">
                  {t("login.email")} <span className="req">*</span>
                </label>

                <div className="input-shell">
                  <img src="/assets/icons/email.svg" alt="" />

                  <input
                    type="email"
                    id="loginEmail"
                    name="email"
                    placeholder={t("login.emailPlaceholder")}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <span className="field-error"></span>
              </div>

              <div className="field" data-field="password">
                <label htmlFor="loginPassword">
                  {t("login.password")} <span className="req">*</span>
                </label>

                <div className="input-shell">
                  <img src="/assets/icons/lock.svg" alt="" />

                  <input
                    type={showPassword ? "text" : "password"}
                    id="loginPassword"
                    name="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <button
                    type="button"
                    className="toggle-visibility"
                    aria-label={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    <img
                      className="icon-show"
                      src="/assets/icons/eye.svg"
                      alt=""
                      style={{
                        display: showPassword ? "none" : "block",
                      }}
                    />

                    <img
                      className="icon-hide"
                      src="/assets/icons/eye-off.svg"
                      alt=""
                      style={{
                        display: showPassword ? "block" : "none",
                      }}
                    />
                  </button>
                </div>

                <span className="field-error"></span>
              </div>

              <div
                className="field-checkbox"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    id="rememberMe"
                    name="rememberMe"
                  />
                  {t("login.remember")}
                </label>

                <a
                  href="#"
                  style={{
                    fontWeight: 600,
                    color: "var(--color-blueprint)",
                  }}
                >
                  {t("login.forgot")}
                </a>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
              >
                {t("login.submit")}
              </button>

              {error ? (
                <p
                  className="form-note"
                  style={{ color: "var(--color-error)" }}
                >
                  {error}
                </p>
              ) : null}

              <p className="form-note">
                {t("login.sessionNote")}
              </p>
            </form>

            <div className="auth-switch">
              {t("login.newHere")}{" "}
              <a href="/register">{t("login.createAccount")}</a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer omitted (left to app shell) */}
    </div>
  );
}