/**
 * Small translation layer between the API spec's snake_case response shapes
 * and the camelCase shape the existing UI components/mock data already use.
 * Keeps every page's JSX untouched — only the data source changes once a
 * real backend exists.
 */
export const LIFT_REGEX = /\b(lift|elevator)\b/i;
export const hasLiftIn = (list = []) => list.some((f) => LIFT_REGEX.test(f));
export function adaptProperty(p) {
  if (!p) return null;
  const owner = p.owner ?? {};
  const photos = Array.isArray(p.photos)
    ? p.photos.map((photo) => (typeof photo === "string" ? photo : photo.photo_url))
    : [];

  return {
    id: String(p.property_id ?? p.id),
    title: p.title ?? p.address,
    address: p.address,
    pricePerMonth: p.rate ?? p.pricePerMonth,
    
    deposit: p.deposit ?? p.securityDeposit,
    securityDeposit: p.deposit ?? p.securityDeposit,
    bedrooms: p.bedroom ?? p.bedrooms,
    bathrooms: p.bathroom ?? p.bathrooms,
    size: p.size_sqft ?? p.size,
    floor: p.floor,
    totalFloors: p.total_floors ?? p.totalFloors,
    hasLift: hasLiftIn(p.facilities ?? p.amenities ?? []),
    availabilityStatus: p.availability_status,
    isOccupied: p.availability_status === "rented",
    isHidden: Boolean(p.is_hidden),
    status: p.availability_status === "available" ? "active" : "occupied",
    lat: p.latitude ?? p.lat,
    lng: p.longitude ?? p.lng,
    listedAt: p.created_at ?? p.listedAt,
    photos: photos.length ? photos : p.photos ?? [],
    amenities: p.facilities ?? p.amenities ?? [],
    description: p.details ?? p.description,
    landlord: {
      id: owner.user_id ?? p.owner_id,
      name: owner.name,
      isVerified: Boolean(owner.is_verified),
      rating: owner.average_rating,
    },
    isWishlisted: false,
  };
}

export function adaptApplication(a) {
  if (!a) return null;
  const tenant = a.tenant ?? {};

  return {
    id: String(a.application_id ?? a.id),
    propertyId: String(a.property_id ?? a.propertyId),
    propertyTitle: a.property_address ?? a.propertyTitle,
    propertyAddress: a.property_address ?? a.propertyAddress,
    tenant: {
      id: tenant.user_id ?? tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.contact_number ?? tenant.phone,
      occupation: a.occupation ?? tenant.occupation,
      monthlyIncome: a.monthly_income ?? tenant.monthlyIncome,
      familySize: a.family_size ?? tenant.familySize,
      message: a.message,
    },
    appliedAt: a.created_at ?? a.appliedAt,
    status: a.status,
  };
}

// LandlordDashboard's applicant cards read flat fields (tenantName,
// occupation, email, ...) rather than the nested `tenant` object that both
// the spec's response and mockData.js actually use. Flatten once here so
// the page's JSX doesn't need touching.
export function flattenApplication(a) {
  const tenant = a.tenant ?? {};
  return {
    ...a,
    tenantName: tenant.name ?? a.tenantName,
    occupation: tenant.occupation ?? a.occupation,
    email: tenant.email ?? a.email,
    phone: tenant.phone ?? a.phone,
    monthlyIncome: tenant.monthlyIncome ?? a.monthlyIncome,
    familySize: tenant.familySize ?? a.familySize,
    message: tenant.message ?? a.message,
    propertyAddress: a.propertyAddress ?? a.property_address,
  };
}