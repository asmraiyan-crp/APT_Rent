import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppNavbar from '../components/AppNavbar.jsx';
import UnitsPanel from '../components/UnitsPanel.jsx';
import Modal from '../components/ui/Modal.jsx';
import { TrendingUp, Users, Calendar, Edit3, Eye, EyeOff, Trash2, ChevronRight, Building2, DollarSign, AlertTriangle, User, FileText, MessageSquare, Wallet } from 'lucide-react';
import PropertyFormModal from '../components/property/PropertyFormModal.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import api from '../services/api';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { adaptProperty, adaptApplication, flattenApplication } from '../services/adapters';
import '../css/global.css';
import '../css/navbar.css';
import '../css/newsfeed-home.css';
import '../css/modules.css';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------


// Local-time YYYY-MM-DD (toISOString would shift the day for UTC+6).
const toLocalISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const emptySlots = () => [
  { appointment_date: '', appointment_time: '' },
  { appointment_date: '', appointment_time: '' },
  { appointment_date: '', appointment_time: '' },
];

export default function LandlordDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t, tx, digits, formatNumber, formatCurrency, formatDate } = useLanguage();
  // ৳35,000 in English, ৳৩৫,০০০ in Bangla
  const taka = (n) => formatCurrency(Number(n ?? 0));

  const [searchParams] = useSearchParams();
  const TABS = ['overview', 'units', 'properties', 'applications', 'ledger'];
  // ?tab=applications (from a notification) opens that tab, even if the dashboard is already open
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(TABS.includes(tabParam) ? tabParam : 'overview');
  const [seenTabParam, setSeenTabParam] = useState(tabParam);
  if (tabParam !== seenTabParam) {
    setSeenTabParam(tabParam);
    if (TABS.includes(tabParam)) setActiveTab(tabParam);
  }
  const [properties, setProperties] = useState([]);
  const [applications, setApplications] = useState([]);

  // GET /landlord/stats and GET /landlord/rent-ledger
  const [stats, setStats] = useState(null);
  const [ledger, setLedger] = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  // POST /appointments — landlord proposes 3 tour slots
  const [tourTarget, setTourTarget] = useState(null);
  const [tourSlots, setTourSlots] = useState(emptySlots());
  const [tourBusy, setTourBusy] = useState(false);
  const [tourDateRange] = useState(() => {
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 14);
    return {
      todayISO: toLocalISODate(today),
      maxTourISO: toLocalISODate(maxDate),
    };
  });

  const [showAddModal, setShowAddModal] = useState(false);
  // Edit reuses the same modal as Add. editTarget holds the property row;
  // editPhotos holds the full photo rows (photo_id is needed to delete one).
  const [editTarget, setEditTarget] = useState(null);
  const [editPhotos, setEditPhotos] = useState([]);

  const [appFilter, setAppFilter] = useState('all');

  const loadStats = () => {
    api.landlord.stats().then(setStats).catch(() => setStats(null));
  };

  const loadLedger = () => {
    api.landlord.rentLedger().then(setLedger).catch(() => setLedger(null));
  };

  useEffect(() => {
    let cancelled = false;

    api.landlord
      .properties()
      .then((data) => {
        if (cancelled) return;
        setProperties((data?.data ?? []).map(adaptProperty));
      })
      .catch(() => setProperties([]));

    api.applications
      .list()
      .then((data) => {
        if (cancelled) return;
        setApplications((data?.data ?? []).map(adaptApplication).map(flattenApplication));
      })
      .catch(() => setApplications([]));

    api.landlord
      .stats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setStats(null); });

    api.landlord
      .rentLedger()
      .then((data) => { if (!cancelled) setLedger(data); })
      .catch(() => { if (!cancelled) setLedger(null); });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------
  const handleDeleteClick = (prop) => {
    setPropertyToDelete(prop);
    setShowDeleteModal(true);
  };

  // DELETE /properties/:id (soft archive). Only removes the card once the
  // server confirms, so a failed delete no longer looks like it worked.
  const confirmDelete = async () => {
    const target = propertyToDelete;
    if (!target) return;
    try {
      await api.properties.remove(target.id);
      setProperties((prev) => prev.filter((p) => p.id !== target.id));
      showToast({ message: 'Listing deleted.', type: 'success' });
      loadStats();
      loadLedger();
    } catch (error) {
      showToast({ message: error.message || 'Could not delete the listing.', type: 'error' });
    } finally {
      setShowDeleteModal(false);
      setPropertyToDelete(null);
    }
  };

  // PATCH /properties/:id/visibility. Optimistic with rollback; functional
  // updates so the rollback can't clobber other changes made meanwhile.
  const toggleVisibility = (id) => {
    const current = properties.find((p) => p.id === id);
    if (!current) return;
    const next = !current.isHidden;
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, isHidden: next } : p)));
    api.properties
      .setVisibility(id, next)
      .then(() => showToast({ message: next ? 'Listing hidden from search.' : 'Listing is visible again.', type: 'success' }))
      .catch((error) => {
        setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, isHidden: current.isHidden } : p)));
        showToast({ message: error.message || 'Could not change visibility.', type: 'error' });
      });
  };

  const handleEditClick = async (property) => {
    // GET /properties/:id returns photos with photo_id, which the edit
    // form needs for DELETE /properties/:id/photos/:photo_id.
    let photos = [];
    try {
      const full = await api.properties.getById(property.id);
      photos = full?.photos ?? [];
    } catch {
      // Photos failing to load shouldn't block editing the listing.
    }
    setEditPhotos(photos);
    setEditTarget(property);
  };

  const handlePropertySaved = (saved) => {
    if (!saved) return;
    setProperties((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
    });
    loadStats();
  };

  // -------------------------------------------------------------------------
  // Applications — PATCH /applications/:id/status (approved | reviewed | rejected)
  // -------------------------------------------------------------------------
  const setLocalStatus = (id, status) =>
    setApplications((prev) => prev.map((app) => (app.id === id ? { ...app, status } : app)));

  const handleReviewProfile = (app) => {
    setSelectedApplicant(app);
    setShowProfileModal(true);

    // Opening a pending application moves it to "reviewed" (spec status).
    if (app.status === 'pending') {
      setLocalStatus(app.id, 'reviewed');
      setSelectedApplicant({ ...app, status: 'reviewed' });
      api.applications.updateStatus(app.id, 'reviewed').catch(() => {
        setLocalStatus(app.id, 'pending');
      });
    }
  };

  const handleDeclineApplicant = async () => {
    if (!selectedApplicant || decisionBusy) return;
    setDecisionBusy(true);
    try {
      await api.applications.updateStatus(selectedApplicant.id, 'rejected');
      setLocalStatus(selectedApplicant.id, 'rejected');
      showToast({ message: 'Application declined. The tenant has been notified.', type: 'success' });
      loadStats();
      setShowProfileModal(false);
    } catch (error) {
      showToast({ message: error.message || 'Could not decline the application.', type: 'error' });
    } finally {
      setDecisionBusy(false);
    }
  };

  // Approve, then issue the lease via POST /contracts (created as "draft").
  // The two steps fail independently, so each gets its own message.
  const handleApproveApplicant = async () => {
    if (!selectedApplicant || decisionBusy) return;
    setDecisionBusy(true);

    const applicationId = selectedApplicant.id;
    const propertyId = selectedApplicant.propertyId;
    const tenantId = selectedApplicant.tenant?.id;
    const property = properties.find((p) => p.id === propertyId);

    try {
      await api.applications.updateStatus(applicationId, 'approved');
      setLocalStatus(applicationId, 'approved');
      loadStats();
    } catch (error) {
      showToast({ message: error.message || 'Could not approve the application.', type: 'error' });
      setDecisionBusy(false);
      return;
    }

    try {
      if (!tenantId || !property) {
        throw new Error('Application approved, but a contract could not be created (missing tenant or property).');
      }

      const today = new Date();
      const oneYearLater = new Date(today);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      const payload = {
        property_id: propertyId,
        tenant_id: tenantId,
        rate: property.pricePerMonth,
        start_date: toLocalISODate(today),
        end_date: toLocalISODate(oneYearLater),
      };
      // Spec also takes deposit; send it when the listing has one.
      if (property.deposit != null) payload.deposit = property.deposit;

      await api.contracts.create(payload);
      showToast({
        message: 'Lease contract created — the tenant can review, sign, and pay the deposit from Contracts.',
        type: 'success',
      });
      loadLedger();
    } catch (error) {
      showToast({
        message: error.message || 'Application approved, but the lease contract could not be created.',
        type: 'error',
      });
    } finally {
      setDecisionBusy(false);
      setShowProfileModal(false);
    }
  };

  const handleMessageApplicant = () => {
    const tenantId = selectedApplicant?.tenant?.id;
    if (!tenantId) return;
    setShowProfileModal(false);
    navigate(`/inbox?contact=${tenantId}&property=${selectedApplicant.propertyId}`);
  };

  // -------------------------------------------------------------------------
  // Tours — POST /appointments with exactly 3 distinct slots in the next 14 days
  // -------------------------------------------------------------------------
  const openTourModal = (app) => {
    setTourTarget(app);
    setTourSlots(emptySlots());
  };

  const updateSlot = (index, field, value) => {
    setTourSlots((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const { todayISO, maxTourISO } = tourDateRange;

  const submitTourSlots = async () => {
    if (!tourTarget || tourBusy) return;

    const tenantId = tourTarget.tenant?.id;
    if (!tenantId) {
      showToast({ message: 'This application has no tenant attached.', type: 'error' });
      return;
    }
    if (tourSlots.some((s) => !s.appointment_date || !s.appointment_time)) {
      showToast({ message: 'Fill in a date and time for all 3 slots.', type: 'error' });
      return;
    }
    if (tourSlots.some((s) => s.appointment_date < todayISO || s.appointment_date > maxTourISO)) {
      showToast({ message: 'Every slot must fall within the next 14 days.', type: 'error' });
      return;
    }
    const keys = tourSlots.map((s) => `${s.appointment_date}T${s.appointment_time}`);
    if (new Set(keys).size !== 3) {
      showToast({ message: 'The 3 slots must be distinct.', type: 'error' });
      return;
    }

    setTourBusy(true);
    try {
      await api.appointments.propose({
        property_id: tourTarget.propertyId,
        tenant_id: tenantId,
        slots: tourSlots.map((s) => ({
          appointment_date: s.appointment_date,
          // Spec uses HH:MM:SS; <input type="time"> yields HH:MM.
          appointment_time: s.appointment_time.length === 5 ? `${s.appointment_time}:00` : s.appointment_time,
        })),
      });
      showToast({ message: 'Tour slots sent. The tenant can now pick one.', type: 'success' });
      setTourTarget(null);
      loadStats();
    } catch (error) {
      showToast({ message: error.message || 'Could not send tour slots.', type: 'error' });
    } finally {
      setTourBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // derived
  // -------------------------------------------------------------------------
  const filteredApps = appFilter === 'all'
    ? applications
    : applications.filter((a) => (a.status || '').toLowerCase() === appFilter);

  const pendingApps = stats?.pending_applications ?? 0;
  const upcomingTours = stats?.upcoming_tours ?? 0;
  const pendingRent = stats?.pending_rent_amount ?? 0;

  const statusBadgeProps = (status) => {
    if (status === 'approved') return { className: 'badge badge-success' };
    if (status === 'reviewed') return { className: 'badge badge-ink' };
    if (status === 'rejected') {
      return { className: 'badge', style: { background: 'rgba(181,83,60,0.12)', color: 'var(--color-error)' } };
    }
    return { className: 'badge badge-warn' };
  };

  const applicantLocked = selectedApplicant && ['approved', 'rejected'].includes(selectedApplicant.status);

  return (
    <div className="module-shell">
      <AppNavbar />

      <main className="module-main-wide">
        {/* Page header */}
        <div style={{ marginBottom: '2rem' }}>
          <span className="eyebrow">{t('landlord.portal')}</span>
          <h1 className="module-title">{t('landlord.title')}</h1>
        </div>

        {/* Tab nav */}
        <div className="pill-tabs" style={{ marginBottom: '2rem' }}>
          <button
            className={`pill-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            {t('landlord.tabOverview')}
          </button>
          <button
            className={`pill-tab ${activeTab === 'units' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('units')}
          >
            {t('units.tab')}
          </button>
          <button
            className={`pill-tab ${activeTab === 'properties' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            {t('landlord.tabProperties', { count: properties.length })}
          </button>
          <button
            className={`pill-tab ${activeTab === 'applications' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('applications')}
          >
            {t('landlord.tabApplications', { count: applications.length })}
          </button>
          <button
            className={`pill-tab ${activeTab === 'ledger' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('ledger'); loadLedger(); }}
          >
            {t('landlord.tabLedger')}
          </button>
        </div>

        {/* TAB: Overview */}
        {activeTab === 'units' && <UnitsPanel />}

        {activeTab === 'overview' && (
          <div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'rgba(200,155,60,0.12)', color: 'var(--color-brass)' }}>
                  <TrendingUp size={24} />
                </div>
                <p className="stat-card-label">{t('landlord.revenue')}</p>
                <h3 className="stat-card-num">{stats ? taka(stats.monthly_gross_revenue) : '—'}</h3>
                <p className="stat-card-sub">{stats ? t('landlord.revenuePending', { amount: taka(pendingRent) }) : t('common.loading')}</p>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'rgba(76,122,93,0.12)', color: 'var(--color-success)' }}>
                  <DollarSign size={24} />
                </div>
                <p className="stat-card-label">{t('landlord.occupied')}</p>
                <h3 className="stat-card-num">{stats ? `${formatNumber(stats.occupied_units)} / ${formatNumber(stats.total_units)}` : '—'}</h3>
                <p className="stat-card-sub">{stats ? t('landlord.occupancyRate', { rate: `${formatNumber(Number(stats.occupancy_rate_pct), { maximumFractionDigits: 1 })}%` }) : t('common.loading')}</p>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'rgba(47,93,138,0.1)', color: 'var(--color-blueprint)' }}>
                  <Building2 size={24} />
                </div>
                <p className="stat-card-label">{t('landlord.vacant')}</p>
                <h3 className="stat-card-num">{stats ? formatNumber(stats.vacant_units) : '—'}</h3>
                <p className="stat-card-sub">{stats?.vacant_units ? t('landlord.vacantReady') : t('landlord.fullyOccupied')}</p>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'rgba(47,93,138,0.1)', color: 'var(--color-blueprint)' }}>
                  <Calendar size={24} />
                </div>
                <p className="stat-card-label">{t('landlord.tours')}</p>
                <h3 className="stat-card-num">{stats ? formatNumber(upcomingTours) : '—'}</h3>
                <p className="stat-card-sub">{t('landlord.toursSub')}</p>
              </div>
            </div>

            <h2 className="section-heading" style={{ marginTop: '2rem' }}>{t('landlord.actionNeeded')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingApps > 0 && (
                <div
                  className="mod-card mod-card-pad"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => { setAppFilter('pending'); setActiveTab('applications'); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Users size={20} color="#f59e0b" />
                    <span style={{ color: 'var(--color-text-strong)', fontWeight: 500 }}>
                      {t('landlord.newApplications', { count: pendingApps })}
                    </span>
                  </div>
                  <ChevronRight size={20} color="var(--color-line-strong)" />
                </div>
              )}
              {upcomingTours > 0 && (
                <div
                  className="mod-card mod-card-pad"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => navigate('/tour-requests')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Calendar size={20} color="var(--color-blueprint)" />
                    <span style={{ color: 'var(--color-text-strong)', fontWeight: 500 }}>
                      {t('landlord.upcomingTour', { count: upcomingTours })}
                    </span>
                  </div>
                  <ChevronRight size={20} color="var(--color-line-strong)" />
                </div>
              )}
              {pendingRent > 0 && (
                <div
                  className="mod-card mod-card-pad"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => { setActiveTab('ledger'); loadLedger(); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Wallet size={20} color="var(--color-error)" />
                    <span style={{ color: 'var(--color-text-strong)', fontWeight: 500 }}>
                      {t('landlord.rentToCollect', { amount: taka(pendingRent) })}
                    </span>
                  </div>
                  <ChevronRight size={20} color="var(--color-line-strong)" />
                </div>
              )}
              {stats && pendingApps === 0 && upcomingTours === 0 && pendingRent === 0 && (
                <div className="mod-card mod-card-pad" style={{ color: 'var(--color-charcoal)' }}>
                  {t('landlord.allCaughtUp')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>{t('landlord.addProperty')}</button>
              <button className="btn btn-ghost" onClick={() => setActiveTab('applications')}>{t('landlord.viewApplications')}</button>
              <button className="btn btn-ghost" onClick={() => navigate('/inbox')}>{t('landlord.goToInbox')}</button>
            </div>
          </div>
        )}

        {/* TAB: Properties */}
        {activeTab === 'properties' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="section-heading" style={{ margin: 0 }}>{t('landlord.tabProperties', { count: properties.length })}</h2>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>{t('landlord.addNewProperty')}</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {properties.map(property => (
                <div key={property.id} className="mod-card" style={{ overflow: 'hidden' }}>
                  <div style={{ height: '180px', position: 'relative' }}>
                    <img
                      src={property.photos && property.photos[0] ? property.photos[0] : ''}
                      alt={property.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x180?text=No+Image'; }}
                    />
                    <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                      {property.status === 'occupied' ? (
                        <span className="badge badge-success">{t('status.occupied')}</span>
                      ) : (
                        <span className="badge badge-warn">{t('status.vacant')}</span>
                      )}
                    </div>
                    {property.isHidden && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <EyeOff size={32} style={{ marginBottom: '8px' }} />
                        <span style={{ fontWeight: 600 }}>{t('status.hidden')}</span>
                      </div>
                    )}
                  </div>

                  <div className="mod-card-pad">
                    <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-strong)', fontWeight: 700, margin: '0 0 4px 0', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {property.title}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-blueprint)', fontSize: '0.85rem', margin: '0 0 12px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {property.address}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-stencil)', fontSize: '1.3rem', color: 'var(--color-text-strong)' }}>{taka(property.pricePerMonth)}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>{t('landlord.perMonth')}</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>{t('landlord.bedBath', { beds: digits(property.bedrooms), baths: digits(property.bathrooms) })}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', paddingTop: '0.75rem', borderTop: '1px solid var(--color-line)', justifyContent: 'flex-end' }}>
                      <button className="icon-action-btn" title={t('landlord.edit')} onClick={() => handleEditClick(property)}>
                        <Edit3 size={18} /> {t('landlord.edit')}
                      </button>
                      <button
                        className="icon-action-btn"
                        title={property.isHidden ? t('landlord.show') : t('landlord.hide')}
                        onClick={() => toggleVisibility(property.id)}
                      >
                        {property.isHidden ? <Eye size={18} /> : <EyeOff size={18} />} {property.isHidden ? t('landlord.show') : t('landlord.hide')}
                      </button>
                      <button className="icon-action-btn danger" title={t('landlord.delete')} onClick={() => handleDeleteClick(property)}>
                        <Trash2 size={18} /> {t('landlord.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {properties.length === 0 && (
                <div className="mod-card mod-card-pad" style={{ textAlign: 'center', color: 'var(--color-charcoal)', gridColumn: '1 / -1' }}>
                  {t('landlord.noProperties')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Applications */}
        {activeTab === 'applications' && (
          <div>
            <h2 className="section-heading">{t('landlord.applicationsTitle')}</h2>
            <div className="pill-tabs" style={{ marginBottom: '1rem' }}>
              {['all', 'pending', 'reviewed', 'approved', 'rejected'].map(f => (
                <button
                  key={f}
                  className={`pill-tab ${appFilter === f ? 'is-active' : ''}`}
                  onClick={() => setAppFilter(f)}
                >
                  {f === 'all' ? t('landlord.filterAll') : tx('status', f)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredApps.map(app => (
                <div key={app.id} className="mod-card mod-card-pad" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
                    <div className="landlord-avatar" style={{ width: '44px', height: '44px', fontSize: '1.2rem' }}>
                      {app.tenantName?.charAt(0) || '—'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-strong)' }}>{app.tenantName || '—'}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>{app.occupation || '—'}</div>
                    </div>
                  </div>

                  <div style={{ flex: '1 1 150px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-blueprint)' }}>{app.propertyTitle || app.propertyAddress || '—'}</div>
                  </div>

                  <div style={{ flex: '0 0 auto' }}>
                    <span {...statusBadgeProps(app.status)}>{tx('status', app.status || 'pending')}</span>
                  </div>

                  <div style={{ flex: '0 0 auto', fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>
                    {app.appliedAt ? formatDate(app.appliedAt, 'medium') : '—'}
                  </div>

                  <div className="action-btns" style={{ flex: '0 0 auto' }}>
                    <button className="icon-action-btn" onClick={() => handleReviewProfile(app)}>
                      <User size={18} /> {t('landlord.reviewProfile')}
                    </button>
                    {/* Proposes 3 tour slots via POST /appointments. Tenant-
                        initiated requests are still handled on /tour-requests. */}
                    <button
                      className="icon-action-btn"
                      onClick={() => openTourModal(app)}
                      style={app.status === 'rejected' ? { opacity: 0.4, pointerEvents: 'none' } : {}}
                    >
                      <Calendar size={18} /> {t('landlord.proposeTour')}
                    </button>
                    <button
                      className="icon-action-btn primary"
                      onClick={() => navigate(`/lease/${app.propertyId}`)}
                      style={app.status !== 'approved' ? { opacity: 0.4, pointerEvents: 'none' } : {}}
                    >
                      <FileText size={18} /> {t('landlord.offerLease')}
                    </button>
                  </div>
                </div>
              ))}
              {filteredApps.length === 0 && (
                <div className="mod-card mod-card-pad" style={{ textAlign: 'center', color: 'var(--color-charcoal)' }}>
                  {t('landlord.noApplications')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Rent Ledger — GET /landlord/rent-ledger */}
        {activeTab === 'ledger' && (
          <div>
            <h2 className="section-heading">{t('landlord.ledgerTitle')}</h2>
            {!ledger ? (
              <div className="mod-card mod-card-pad" style={{ textAlign: 'center', color: 'var(--color-charcoal)' }}>
                {t('landlord.ledgerUnavailable')}
              </div>
            ) : (
              <>
                <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
                  <div className="stat-card">
                    <p className="stat-card-label">{t('landlord.receivableThisMonth')}</p>
                    <h3 className="stat-card-num">{taka(ledger.summary?.total_monthly_receivable)}</h3>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card-label">{t('landlord.collected')}</p>
                    <h3 className="stat-card-num">{taka(ledger.summary?.total_collected)}</h3>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card-label">{t('landlord.pendingAmount')}</p>
                    <h3 className="stat-card-num">{taka(ledger.summary?.total_pending)}</h3>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(ledger.records ?? []).map((rec) => (
                    <div
                      key={rec.contract_id}
                      className="mod-card mod-card-pad"
                      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}
                    >
                      <div style={{ flex: '1 1 200px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-strong)' }}>{rec.tenant_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-blueprint)' }}>{rec.property_address}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-stencil)', color: 'var(--color-text-strong)' }}>{taka(rec.amount)}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>
                        {t('landlord.dueBy', {
                          date: formatDate(`${String(rec.deadline).slice(0, 10)}T00:00:00`, 'medium'),
                        })}
                      </div>
                      <span className={`badge ${rec.status === 'paid' ? 'badge-success' : 'badge-warn'}`}>
                        {tx('status', rec.status)}
                      </span>
                    </div>
                  ))}
                  {(ledger.records ?? []).length === 0 && (
                    <div className="mod-card mod-card-pad" style={{ textAlign: 'center', color: 'var(--color-charcoal)' }}>
                      {t('landlord.noContracts')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Delete Modal */}
      {showDeleteModal && (
        <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Listing" size="sm">
          <div className="success-screen" style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(181,83,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-error)', margin: '0 auto 1rem' }}>
              <AlertTriangle size={24} />
            </div>
            <p style={{ color: 'var(--color-charcoal)', fontSize: '0.95rem', textAlign: 'center' }}>
              Are you sure you want to delete <strong>{propertyToDelete?.title}</strong>?
            </p>
            <p style={{ color: 'var(--color-subtle)', fontSize: '0.82rem', textAlign: 'center', marginBottom: '1.5rem' }}>The listing will be archived and removed from search.</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-dark" style={{ flex: 1, background: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={confirmDelete}>Delete Listing</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Profile Modal */}
      {showProfileModal && selectedApplicant && (
        <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} title="Applicant Profile" size="lg">
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div className="landlord-avatar" style={{ width: '64px', height: '64px', background: 'var(--color-ink)', color: '#fff', border: '2px solid var(--color-brass)', fontSize: '1.8rem' }}>
              {selectedApplicant.tenantName?.charAt(0) || '—'}
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', margin: '0 0 4px 0', color: 'var(--color-text-strong)' }}>
                {selectedApplicant.tenantName || '—'}
              </h2>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-blueprint)' }}>
                {[selectedApplicant.email, selectedApplicant.phone].filter(Boolean).join(' • ') || '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="mod-card mod-card-pad">
              <span className="mod-label">Occupation & Income</span>
              <div style={{ fontWeight: 500, color: 'var(--color-text-strong)', marginTop: '4px' }}>
                {selectedApplicant.occupation || '—'} • {selectedApplicant.monthlyIncome != null ? `${taka(selectedApplicant.monthlyIncome)}/mo` : '—'}
              </div>
            </div>
            <div className="mod-card mod-card-pad">
              <span className="mod-label">Family Size</span>
              <div style={{ fontWeight: 500, color: 'var(--color-text-strong)', marginTop: '4px' }}>
                {selectedApplicant.familySize != null ? `${selectedApplicant.familySize} members` : '—'}
              </div>
            </div>
          </div>

          <span className="mod-label">Cover Letter</span>
          <blockquote style={{ background: 'var(--color-paper-dim)', borderLeft: '3px solid var(--color-brass)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontStyle: 'italic', color: 'var(--color-charcoal)', fontSize: '0.9rem', margin: '0.5rem 0 1.5rem 0' }}>
            {selectedApplicant.message || 'The applicant did not include a message.'}
          </blockquote>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-line)' }}>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              disabled={decisionBusy || applicantLocked}
              onClick={handleDeclineApplicant}
            >
              Decline
            </button>
            <button
              className="btn btn-ghost"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={handleMessageApplicant}
            >
              <MessageSquare size={15} />
              Message
            </button>
            <button
              className="btn btn-primary"
              disabled={decisionBusy || applicantLocked}
              onClick={handleApproveApplicant}
            >
              {selectedApplicant.status === 'approved' ? 'Approved' : decisionBusy ? 'Working…' : 'Approve Applicant'}
            </button>
          </div>
        </Modal>
      )}

      {/* Propose Tour Modal */}
      {tourTarget && (
        <Modal isOpen onClose={() => setTourTarget(null)} title="Propose Tour Times" size="md">
          <p style={{ color: 'var(--color-charcoal)', fontSize: '0.9rem', marginTop: 0 }}>
            Offer {tourTarget.tenantName || 'the tenant'} three different slots within the next 14 days. They'll confirm one.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '1rem 0 1.5rem' }}>
            {tourSlots.map((slot, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span className="mod-label" style={{ minWidth: 52 }}>Slot {i + 1}</span>
                <input
                  type="date"
                  className="mod-input"
                  min={todayISO}
                  max={maxTourISO}
                  value={slot.appointment_date}
                  onChange={(e) => updateSlot(i, 'appointment_date', e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="time"
                  className="mod-input"
                  value={slot.appointment_time}
                  onChange={(e) => updateSlot(i, 'appointment_time', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setTourTarget(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={tourBusy} onClick={submitTourSlots}>
              {tourBusy ? 'Sending…' : 'Send Slots'}
            </button>
          </div>
        </Modal>
      )}

      {showAddModal && (
        <PropertyFormModal
          isOpen
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSaved={handlePropertySaved}
        />
      )}

      {editTarget && (
        <PropertyFormModal
          key={editTarget.id}
          isOpen
          mode="edit"
          property={editTarget}
          existingPhotos={editPhotos}
          onClose={() => setEditTarget(null)}
          onSaved={handlePropertySaved}
        />
      )}
    </div>
  );
}