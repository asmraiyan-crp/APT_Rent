import { Link } from "react-router-dom";

import { BedDouble, Bath, ArrowUpDown, Share2 } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useToast } from "./ui/Toast.jsx";
import { hasLiftIn } from "../services/adapters";
import SaveButton from "./SaveButton.jsx";
import AvailabilityBadge from "./AvailabilityBadge.jsx";

// Clipboard API needs HTTPS/localhost; this fallback covers plain-http and older browsers.
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy method */
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function ApartmentCard({ apartment }) {
  const { showToast } = useToast();
  const { t, pick, timeAgo, formatNumber, formatCurrency } = useLanguage();

  const id = apartment.id ?? apartment.property_id;
  const photos = apartment.photos ?? [];
  const listedAt =
    apartment.listedAt ?? apartment.createdAt ?? apartment.created_at;

  const address =
    pick(apartment, "address") ??
    pick(apartment, "title") ??
    t("listing.untitled");

  const pricePerMonth = apartment.pricePerMonth ?? apartment.rate ?? 0;
  const bedrooms = apartment.bedrooms ?? apartment.bedroom ?? "—";
  const bathrooms = apartment.bathrooms ?? apartment.bathroom ?? "—";

  // adaptProperty() already computes hasLift; fall back to scanning the
  // amenities/facilities list for raw API data.
  const amenityList = apartment.amenities ?? apartment.facilities ?? [];
  const hasLift = apartment.hasLift ?? hasLiftIn(amenityList);

  const visiblePhotos = photos.slice(0, 3);
  const extraPhotoCount = Math.max(photos.length - 3, 0);
  const postDetailsUrl = `/property/${id}`;

  async function handleShare(event) {
    // The whole card is a <Link>; stop the click from navigating.
    event.preventDefault();
    event.stopPropagation();

    const fullUrl = `${window.location.origin}/property/${id}`;

    // On phones/tablets, open the native share sheet when available.
    const isTouch = window.matchMedia?.("(pointer: coarse)").matches;

    if (isTouch && navigator.share) {
      try {
        await navigator.share({ title: address, url: fullUrl });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        // Any other failure: fall back to copying below.
      }
    }

    const copied = await copyText(fullUrl);

    showToast(
      copied
        ? { message: t("listing.linkCopied"), type: "success" }
        : { message: t("listing.copyFailed"), type: "error" },
    );
  }

  return (
    <Link
      to={postDetailsUrl}
      className="apartment-card"
      aria-label={t("listing.viewDetails", { address })}
    >
      <span className="apartment-card-badge"><AvailabilityBadge status={apartment.availabilityStatus} /></span>
      <div className="apartment-card-tools">
        <SaveButton propertyId={id} />
      </div>

      {/* ===================== PHOTO GRID ===================== */}
      <div className="apartment-photos">
        {visiblePhotos.map((photoUrl, index) => {
          const isLastVisibleTile = index === visiblePhotos.length - 1;
          const showOverflowBadge =
            isLastVisibleTile && extraPhotoCount > 0;

          return (
            <div className="apartment-photo-tile" key={photoUrl + index}>
              <img
                src={photoUrl}
                alt={t("listing.photoAlt", {
                  address,
                  index: index + 1,
                })}
              />

              {showOverflowBadge && (
                <span className="apartment-photo-overflow">
                  +{formatNumber(extraPhotoCount)}
                </span>
              )}
            </div>
          );
        })}

        {visiblePhotos.length === 0 && (
          <div className="apartment-photo-tile apartment-photo-placeholder">
            <span>{t("listing.noPhotos")}</span>
          </div>
        )}
      </div>

      <div className="apartment-card-body">
        <p className="apartment-listed-date">
          {timeAgo(listedAt, { style: "short" })}
        </p>

        <h3 className="apartment-address">{address}</h3>

        <p className="apartment-price">
          {t("common.perMonth", {
            price: formatCurrency(pricePerMonth),
          })}
        </p>

        {/* ===================== META ROW (bed / bath / lift) ===================== */}
        <ul className="apartment-icon-row">
          <li title={t("listing.bedrooms")}>
            <BedDouble size={18} aria-hidden="true" />
            <span className="meta-value">
              {formatNumber(bedrooms) || bedrooms}
            </span>
            <span className="meta-label">{t("listing.bed")}</span>
          </li>

          <li title={t("listing.bathrooms")}>
            <Bath size={18} aria-hidden="true" />
            <span className="meta-value">
              {formatNumber(bathrooms) || bathrooms}
            </span>
            <span className="meta-label">{t("listing.bath")}</span>
          </li>

          <li
            title={t("listing.lift")}
            className={hasLift ? "" : "is-muted"}
          >
            <ArrowUpDown size={18} aria-hidden="true" />
            <span className="meta-value">
              {hasLift ? t("common.yes") : t("common.no")}
            </span>
            <span className="meta-label">{t("listing.lift")}</span>
          </li>
        </ul>

        {/* ===================== SHARE BUTTON ===================== */}
        <div className="apartment-actions">
          <button
            type="button"
            className="share-btn"
            onClick={handleShare}
            aria-label={t("listing.shareAria")}
          >
            <Share2 size={16} aria-hidden="true" />
            {t("listing.share")}
          </button>
        </div>
      </div>
    </Link>
  );
}