/**
 * Single source of truth for talking to the APT Rent backend.
 *
 * Every function here maps 1:1 to an endpoint in the API spec sheet
 * ("APT Rent — Complete REST API Specification", v2.5). Build the backend
 * to match these routes/payloads/response shapes and the frontend just
 * works — no guessing required on either side.
 *
 * Every page in this app calls these functions and falls back to its local
 * mock data if the call fails (no backend yet) — so nothing breaks today,
 * and nothing needs to change here once the backend exists.
 */
import apiClient from "./apiClient";

// ---------------------------------------------------------------------------
// 2. Authentication & User Identity
// ---------------------------------------------------------------------------
export const auth = {
  register: (payload) => apiClient.post("/auth/register", payload).then((r) => r.data),
  login: (payload) => apiClient.post("/auth/login", payload).then((r) => r.data),
  logout: () => apiClient.post("/auth/logout").then((r) => r.data),
};

export const users = {
  me: () => apiClient.get("/auth/me").then((r) => r.data),
  updateMe: (payload) => apiClient.patch("/users/me", payload).then((r) => r.data),
  uploadDocuments: (formData) =>
    apiClient
      .post("/users/me/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  getPublicProfile: (userId) => apiClient.get(`/users/${userId}`).then((r) => r.data),
  // Full record of the signed-in user (includes verification status and signed document links).
  getMe: () => apiClient.get("/users/me").then((r) => r.data),
  // Detailed profile page: what you can see depends on your relationship to the user.
  getProfile: (userId) => apiClient.get(`/users/${userId}/profile`).then((r) => r.data),
  uploadAvatar: (fileOrFormData) => {
    const formData = fileOrFormData instanceof FormData ? fileOrFormData : (() => {
      const next = new FormData();
      next.append("avatar", fileOrFormData);
      return next;
    })();
    return apiClient
      .post("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  removeAvatar: () => apiClient.delete("/users/me/avatar").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 3. Properties & Photos Engine
// ---------------------------------------------------------------------------
export const properties = {
  search: (params) => apiClient.get("/properties", { params }).then((r) => r.data),
  getById: (propertyId) => apiClient.get(`/properties/${propertyId}`).then((r) => r.data),
  create: (payload) => apiClient.post("/properties", payload).then((r) => r.data),
  update: (propertyId, payload) =>
    apiClient.patch(`/properties/${propertyId}`, payload).then((r) => r.data),
  remove: (propertyId) => apiClient.delete(`/properties/${propertyId}`).then((r) => r.data),
  uploadPhotos: (propertyId, formData) =>
    apiClient
      .post(`/properties/${propertyId}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  deletePhoto: (propertyId, photoId) =>
    apiClient.delete(`/properties/${propertyId}/photos/${photoId}`).then((r) => r.data),
  setVisibility: (propertyId, isHidden) =>
    apiClient
      .patch(`/properties/${propertyId}/visibility`, { is_hidden: isHidden })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 4. Tenant Applications
// ---------------------------------------------------------------------------
export const applications = {
  create: (payload) => apiClient.post("/applications", payload).then((r) => r.data),
  list: () => apiClient.get("/applications").then((r) => r.data),
  updateStatus: (applicationId, status) =>
    apiClient.patch(`/applications/${applicationId}/status`, { status }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 5. Appointments (3-Slot Tour Scheduling)
// ---------------------------------------------------------------------------
export const appointments = {
  // Tenant-initiated: opens the negotiation with a preferred date.
  request: (payload) => apiClient.post("/appointments/request", payload).then((r) => r.data),
  // Landlord's reply. Pass request_id to answer a tenant's request
  // (the tenant and batch then come from the request row, not the body);
  // omit it for a standalone batch, which still needs tenant_id.
  propose: (payload) => apiClient.post("/appointments", payload).then((r) => r.data),
  // Rejecting is per-request: all 3 proposed times are cancelled and
  // the request stays open so the landlord can offer another set.
  reject: (appointmentId, reason) =>
    apiClient.patch(`/appointments/${appointmentId}/reject`, { reason }).then((r) => r.data),
  confirm: (appointmentId, confirmedAppointmentId) =>
    apiClient
      .patch(`/appointments/${appointmentId}/confirm`, {
        confirmed_appointment_id: confirmedAppointmentId,
      })
      .then((r) => r.data),
  list: () => apiClient.get("/appointments").then((r) => r.data),
  cancel: (appointmentId, cancellationReason) =>
    apiClient
      .patch(`/appointments/${appointmentId}/cancel`, {
        cancellation_reason: cancellationReason,
      })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 6. Contracts & Digital Handshake
// ---------------------------------------------------------------------------
export const contracts = {
  create: (payload) => apiClient.post("/contracts", payload).then((r) => r.data),
  // Every lease the signed-in user is a party to (owner or tenant).
  list: () => apiClient.get("/contracts").then((r) => r.data),
  getById: (contractId) => apiClient.get(`/contracts/${contractId}`).then((r) => r.data),
  negotiate: (contractId, payload) =>
    apiClient.patch(`/contracts/${contractId}/negotiate`, payload).then((r) => r.data),
  accept: (contractId) =>
    apiClient.patch(`/contracts/${contractId}/accept`).then((r) => r.data),
  sign: (contractId, signatureImageBase64) =>
    apiClient
      .patch(`/contracts/${contractId}/sign`, { signature_image_base64: signatureImageBase64 })
      .then((r) => r.data),
  payDeposit: (contractId, payload) =>
    apiClient.post(`/contracts/${contractId}/deposit`, payload).then((r) => r.data),

   negotiate: (contractId, payload) =>
    apiClient.patch(`/contracts/${contractId}/negotiate`, payload).then((r) => r.data),
  // The other party accepts the proposed terms (unlocks signing).
  accept: (contractId) =>
    apiClient.patch(`/contracts/${contractId}/accept`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 7. Rent Billing & Payment Engine
// ---------------------------------------------------------------------------
export const rent = {
  current: () => apiClient.get("/rent/current").then((r) => r.data),
  payments: {
    create: (payload) => apiClient.post("/payments", payload).then((r) => r.data),
  },
  scheduleCashPickup: (payload) =>
    apiClient.post("/rent/cash-schedule", payload).then((r) => r.data),
  history: () => apiClient.get("/history").then((r) => r.data),
  landlordLedger: () => apiClient.get("/landlord/rent-ledger").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 8. Conversations & Live Messaging
// ---------------------------------------------------------------------------
export const conversations = {
  list: () => apiClient.get("/conversations").then((r) => r.data),
  start: (payload) => apiClient.post("/conversations", payload).then((r) => r.data),
  getMessages: (conversationId, params) =>
    apiClient.get(`/conversations/${conversationId}/messages`, { params }).then((r) => r.data),
  sendMessage: (conversationId, messageText) =>
    apiClient
      .post(`/conversations/${conversationId}/messages`, { message_text: messageText })
      .then((r) => r.data),
  markRead: (conversationId) =>
    apiClient.patch(`/conversations/${conversationId}/read`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 9. Universal Notification Hub
// ---------------------------------------------------------------------------
export const notifications = {
  list: () => apiClient.get("/notifications").then((r) => r.data),
  markRead: (notificationId) =>
    apiClient.patch(`/notifications/${notificationId}/read`).then((r) => r.data),
  markAllRead: () => apiClient.patch("/notifications/read-all").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 10. User Reviews (Trust System)
// ---------------------------------------------------------------------------
export const reviews = {
  getForUser: (userId) => apiClient.get(`/users/${userId}/reviews`).then((r) => r.data),
  create: (userId, payload) => apiClient.post(`/users/${userId}/reviews`, payload).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 11. Landlord Dashboard Aggregations
// ---------------------------------------------------------------------------
export const landlord = {
  stats: () => apiClient.get("/landlord/stats").then((r) => r.data),
  properties: () => apiClient.get("/landlord/properties").then((r) => r.data),
  rentLedger: () => apiClient.get("/landlord/rent-ledger").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// 12. Admin Oversight & Dispute Resolution
// ---------------------------------------------------------------------------
export const admin = {
  stats: () => apiClient.get("/admin/stats").then((r) => r.data),
  users: () => apiClient.get("/admin/users").then((r) => r.data),
  createUser: (payload) => apiClient.post("/admin/users", payload).then((r) => r.data),
  toggleAdminRole: (userId) =>
    apiClient.patch(`/admin/users/${userId}/admin`).then((r) => r.data),
  toggleBanUser: (userId) =>
    apiClient.patch(`/admin/users/${userId}/ban`).then((r) => r.data),
  verifications: () => apiClient.get("/admin/verifications").then((r) => r.data),
  approveVerification: (userId) =>
    apiClient.patch(`/admin/verifications/${userId}/approve`).then((r) => r.data),
  rejectVerification: (userId, rejectionReason) =>
    apiClient
      .patch(`/admin/verifications/${userId}/reject`, { rejection_reason: rejectionReason })
      .then((r) => r.data),
  createDispute: (payload) => apiClient.post("/admin/disputes", payload).then((r) => r.data),
  resolveDispute: (disputeId, resolutionNotes) =>
    apiClient
      .patch(`/admin/disputes/${disputeId}/resolve`, { resolution_notes: resolutionNotes })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Saved listings
// ---------------------------------------------------------------------------
export const saved = {
  list: () => apiClient.get("/saved").then((r) => r.data),
  ids: () => apiClient.get("/saved/ids").then((r) => r.data),
  save: (propertyId) => apiClient.post(`/saved/${propertyId}`).then((r) => r.data),
  remove: (propertyId) => apiClient.delete(`/saved/${propertyId}`).then((r) => r.data),
};

export const tenant = {
  dashboard: () => apiClient.get("/tenant/dashboard").then((r) => r.data),
};

const api = {
  auth,
  users,
  properties,
  applications,
  appointments,
  contracts,
  rent,
  conversations,
  notifications,
  reviews,
  landlord,
  admin,
  saved,
  tenant,
};

export default api;