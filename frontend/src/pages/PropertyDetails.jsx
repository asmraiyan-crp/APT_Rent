import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import AppNavbar from "../components/AppNavbar.jsx";
import ImageSlider from "../components/property/ImageSlider.jsx";
import PropertyInfo from "../components/property/PropertyInfo.jsx";
import PropertyLocation from "../components/property/PropertyLocation.jsx";
import PropertyCTA from "../components/property/PropertyCTA.jsx";
import ReviewsSection from "../components/property/ReviewsSection.jsx";
import api from "../services/api";
import { adaptProperty } from "../services/adapters";
import { useApp } from "../context/AppContext.jsx";
import SaveButton from "../components/SaveButton.jsx";
import AvailabilityBadge from "../components/AvailabilityBadge.jsx";
import { useBreadcrumbLabel } from "../hooks/useBreadcrumbLabel.js";
import "../css/global.css";
import "../css/navbar.css";
import "../css/newsfeed-home.css";
import "../css/modules.css";
import { useLanguage } from "../i18n/LanguageContext.jsx";

export default function PropertyDetails() {
  const { id, propertyId } = useParams();
  const navigate = useNavigate();
  const { currentUser, authReady } = useApp();
  const { t } = useLanguage();

  const targetId = id || propertyId;
  const [property, setProperty] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api.properties
      .getById(targetId)
      .then((data) => {
        if (!cancelled) setProperty(adaptProperty(data));
      })
      .catch((error) => {
        if (!cancelled) {
          setProperty(null);
          setLoadError(error.message || "__default__");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  useBreadcrumbLabel(property?.title ?? property?.address);

  const handleContactLandlord = () => {
    if (property?.landlord?.id) {
      
      const target = `/inbox?contact=${property.landlord.id}&property=${property.id}`;

      if (authReady && !currentUser) {
        navigate("/login", {
          state: {
            from: {
              pathname: "/inbox",
              search: target.slice("/inbox".length),
            },
          },
        });
        return;
      }

      navigate(target);
    }
  };

  // 404 / Loading / Error state
  if (isLoading || !property) {
    return (
      <div className="module-shell">
        <AppNavbar />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 1rem",
            textAlign: "center",
          }}
        >
          <Building2
            size={56}
            style={{
              color: "var(--color-line-strong)",
              marginBottom: "1.5rem",
            }}
          />

          <h1
            className="module-title"
            style={{ fontSize: "1.6rem" }}
          >
            {isLoading
              ? t("propertyDetails.loadingTitle")
              : loadError
                ? t("propertyDetails.unableToLoad")
                : t("propertyDetails.notFound")}
          </h1>

          <p
            className="module-subtitle"
            style={{ maxWidth: "360px", marginTop: "8px" }}
          >
            {isLoading
              ? t("propertyDetails.loadingBody")
              : loadError
                ? loadError === "__default__"
                  ? t("propertyDetails.loadFailed")
                  : loadError
                : t("propertyDetails.notFoundBody")}
          </p>

          <Link
            to="/dashboard"
            className="btn btn-primary"
            style={{ marginTop: "1.5rem" }}
          >
            ← {t("propertyDetails.backToListings")}
          </Link>
        </main>

        <footer className="site-footer">
          <div className="container">
            <p>APT&nbsp;RENT // EST. 2026</p>
          </div>
        </footer>
      </div>
    );
  }

  // Main page
  return (
    <div className="module-shell">
      <AppNavbar />

      <main
        className="module-main"
        style={{ paddingBottom: "6rem" }}
      >
        {/* Back button + save */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <button
            className="back-btn"
            style={{ marginBottom: 0 }}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={15} />{" "}
            {t("propertyDetails.backToListings")}
          </button>
          <div className="fx-actions"><AvailabilityBadge status={property.availabilityStatus} /><SaveButton propertyId={property.id} variant="full" /></div>
        </div>

        {/* Two-column layout */}
        <div className="property-layout">
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2.5rem",
            }}
          >
            <ImageSlider
              images={property.photos}
              title={property.title}
            />

            <PropertyInfo property={property} />

            <div
              style={{
                borderTop: "1px solid var(--color-line)",
                paddingTop: "2rem",
              }}
            >
              <PropertyLocation
                lat={property.lat}
                lng={property.lng}
                title={property.title}
                address={property.address}
              />
            </div>

            <div
              style={{
                borderTop: "1px solid var(--color-line)",
                paddingTop: "2rem",
              }}
            >
              <ReviewsSection propertyId={property.id} />
            </div>
          </div>

          {/* Right column: desktop CTA */}
          <div className="property-sidebar cta-desktop">
            <PropertyCTA
              propertyId={property.id}
              ownerId={property.landlord?.id}
              pricePerMonth={property.pricePerMonth}
              onContactLandlord={handleContactLandlord}
            />
          </div>
        </div>
      </main>

      {/* Mobile CTA */}
      <PropertyCTA
        propertyId={property.id}
        ownerId={property.landlord?.id}
        pricePerMonth={property.pricePerMonth}
        onContactLandlord={handleContactLandlord}
        mobileOnly
      />

      <footer
        className="site-footer"
        style={{ marginTop: "auto" }}
      >
        <div className="container">
          <p>APT&nbsp;RENT // EST. 2026</p>
        </div>
      </footer>
    </div>
  );
}