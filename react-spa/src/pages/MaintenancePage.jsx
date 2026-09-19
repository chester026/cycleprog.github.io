// Web port of BikeLabApp/src/screens/BikeGarageScreen.tsx — the mobile app's
// bike maintenance / component-health screen. This mirrors its data bindings
// (GET /api/bikes, GET /api/bikes/:id/health, POST .../reset,
// PUT /api/bikes/:id/labels), visuals and behavior 1:1, minus the
// BikeOnboarding flow (skipped for now — the overview/components below
// render regardless of health.onboardingCompleted).
//
// Copy is taken verbatim from BikeLabApp/src/i18n/en.json's `bikeGarage`
// namespace (the app uses react-i18next; the web has no i18n layer yet, so
// the English strings are hardcoded here).
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import { COMPONENT_LABELS, GROUP_LABELS, COMPONENT_GROUPS } from '@bikelab/shared/constants';
import { useBikes } from '../data/hooks/useBikes';
import { useBikeHealth, useResetBikeComponent, useSaveBikeLabels } from '../data/hooks/useBikeHealth';
import { useConfirm, useToast } from '../ui';
import './MaintenancePage.css';

const STATUS_TINT = {
  good: '#CCCCCC',
  warning: '#f59e0b',
  attention: '#f59e0b',
  critical: '#ef4444',
};

const GAUGE_SIZE = 132;
const GAUGE_STROKE = 7;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

// COMPONENT_LABELS / GROUP_LABELS / COMPONENT_GROUPS moved to
// @bikelab/shared/constants (T-2.4, docs/audit/00-AUDIT-AND-PLAN.md,
// docs/audit/layers/04-cross-layer.md §4.9/§6.1) — bikeGarage.comp_* /
// group_* strings from en.json, same fixed grouping as the app screen.

// Ported 1:1 from BikeLabApp/src/assets/img/icons/EditIcon.tsx / SparkleIcon.tsx.
function EditIcon({ size = 13, color = '#C7C7CC' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </svg>
  );
}

function SparkleIcon({ size = 32, color = '#274dd3' }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <path d="M480-120 405-315 210-390l195-75 75-195 75 195 195 75-195 75-75 195Z" />
    </svg>
  );
}

function SheetRow({ label, value }) {
  return (
    <div className="maint-sheet-row">
      <span className="maint-sheet-row-label">{label}</span>
      <span className="maint-sheet-row-val">{value}</span>
    </div>
  );
}

export default function MaintenancePage() {
  const navigate = useNavigate();

  const [selectedBikeId, setSelectedBikeId] = useState(null);

  const [detailComponent, setDetailComponent] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // T-6.2: GET /api/bikes and GET /api/bikes/:id/health now go through the
  // shared query cache (useBikes/useBikeHealth) instead of this page's own
  // useState+useEffect+apiFetch loading dance.
  const { data: bikesData, isLoading: loading, refetch: refetchBikes } = useBikes();
  const bikes = bikesData || [];

  useEffect(() => {
    if (!selectedBikeId && bikesData && bikesData.length > 0) {
      const primary = bikesData.find(b => b.primary) || bikesData[0];
      setSelectedBikeId(primary.id);
    }
  }, [bikesData, selectedBikeId]);

  const {
    data: health,
    isLoading: healthLoading,
    refetch: refetchHealth,
  } = useBikeHealth(selectedBikeId);

  const resetComponent = useResetBikeComponent();
  const saveLabels = useSaveBikeLabels();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchBikes(), selectedBikeId ? refetchHealth() : Promise.resolve()]);
    setRefreshing(false);
  };

  const openDetail = (comp) => {
    setDetailComponent(comp);
    requestAnimationFrame(() => setSheetOpen(true));
  };

  const closeDetail = () => {
    setSheetOpen(false);
    setTimeout(() => setDetailComponent(null), 220);
  };

  // T-6.3 (audit W-21): `window.confirm`/`alert` -> `useConfirm`/`useToast`.
  const handleReset = async (componentId) => {
    if (!selectedBikeId) return;
    const ok = await confirm({
      title: 'Mark as replaced',
      message: 'Mark this component as just replaced? The wear counter will reset.',
      confirmText: 'Mark as replaced',
    });
    if (!ok) return;
    try {
      await resetComponent.mutateAsync({ bikeId: selectedBikeId, componentId });
      closeDetail();
    } catch {
      toast.error('Failed to reset component. Please try again.');
    }
  };

  const openRename = (type, key, currentLabel) => {
    setRenameTarget({ type, key, currentLabel });
    setRenameValue(currentLabel);
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameValue('');
  };

  const renameSaving = saveLabels.isPending;

  const saveRename = async () => {
    if (!selectedBikeId || !renameTarget || !renameValue.trim()) return;
    try {
      await saveLabels.mutateAsync({
        bikeId: selectedBikeId,
        labels: [{ target_type: renameTarget.type, target_key: renameTarget.key, custom_name: renameValue.trim() }],
      });
      closeRename();
    } catch {
      toast.error('Failed to save the new name. Please try again.');
    }
  };

  const selectedBike = bikes.find(b => b.id === selectedBikeId) || bikes[0];

  if (loading) {
    return (
      <div className="main-layout">
        <div className="main maintenance-page">
          <div className="maint-center">
            <div className="maint-spinner" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (bikes.length === 0) {
    return (
      <div className="main-layout">
        <div className="main maintenance-page">
          <div className="maint-center">
            <div className="maint-empty-title">No bikes added yet</div>
            <div className="maint-empty-hint">Add bikes in Strava to see them here</div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="main-layout">
      <div className="main maintenance-page">
        <div className="maint-container">
          <div className="maint-page-header">
            <h2 className="maint-page-title">Maintenance</h2>
            <button
              className={`maint-refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>

          {bikes.length > 1 && (
            <div className="maint-pills">
              {bikes.map(bike => (
                <button
                  key={bike.id}
                  className={`maint-pill ${bike.id === selectedBikeId ? 'active' : ''}`}
                  onClick={() => setSelectedBikeId(bike.id)}
                >
                  {bike.brand_name && bike.model_name ? `${bike.brand_name} ${bike.model_name}` : bike.name}
                </button>
              ))}
            </div>
          )}

          {selectedBike && (
            <div className="maint-hero">
              <div className="maint-hero-name-row">
                <span className="maint-bike-name">
                  {selectedBike.brand_name && selectedBike.model_name
                    ? `${selectedBike.brand_name} ${selectedBike.model_name}`
                    : selectedBike.name}
                </span>
                {selectedBike.primary && <span className="maint-primary-badge">Primary</span>}
              </div>
              <div className="maint-hero-stats">
                <span className="maint-hero-stat-val">{selectedBike.distanceKm.toLocaleString()}</span>
                <span className="maint-hero-stat-unit">km</span>
                <span className="maint-hero-dot" />
                <span className="maint-hero-stat-val">{selectedBike.activitiesCount}</span>
                <span className="maint-hero-stat-unit">rides</span>
              </div>
            </div>
          )}

          {healthLoading ? (
            <div className="maint-center maint-health-loading">
              <div className="maint-spinner" />
            </div>
          ) : health ? (
            /* Trello-style board: one column per category, each a stack of
               cards. "Bike Health" is always the leftmost column (overview
               gauge/profile, next-service, ask-coach — each its own card),
               followed by one column per COMPONENT_GROUPS entry. */
            <div className="maint-board">
              <div className="maint-column">
                <div className="maint-column-header">
                  <span className="maint-section-title">Bike Health</span>
                </div>
                <div className="maint-column-cards">
                  <div className="maint-board-card maint-health-card">
                    <div className="maint-overview-top">
                      <div className="maint-gauge-wrap">
                        <svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
                          <circle
                            cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                            stroke="#DDDDE0" strokeWidth={GAUGE_STROKE} fill="none"
                          />
                          <circle
                            cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                            stroke="#1A1A1A" strokeWidth={GAUGE_STROKE} fill="none"
                            strokeDasharray={`${(health.overallHealth / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
                          />
                        </svg>
                        <div className="maint-gauge-label">
                          <div className="maint-gauge-val-row">
                            <span className="maint-gauge-val">{health.overallHealth}</span>
                            <span className="maint-gauge-suffix">%</span>
                          </div>
                          <div className="maint-gauge-caption">Bike Health</div>
                        </div>
                      </div>

                      <div className="maint-profile-info">
                        <div className="maint-profile-title">{health.riderProfile?.profile || 'Rider'}</div>
                        <div className="maint-style-bars">
                          {[
                            { key: 'climbing', label: 'Climbing', value: health.ridingStyle.climbing },
                            { key: 'sprint', label: 'Sprint/Attack', value: health.ridingStyle.sprint },
                            { key: 'power', label: 'Power', value: health.ridingStyle.power },
                          ]
                            .sort((a, b) => b.value - a.value)
                            .map(item => (
                              <div key={item.key} className="maint-sbar">
                                <span className="maint-sbar-label">{item.label}</span>
                                <span className="maint-sbar-val">{item.value}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {health.nextService.inKm > 0 && (
                    <div className="maint-board-card maint-next-svc-card">
                      <div className="maint-next-svc-left">
                        <div className="maint-next-svc-label">Next service</div>
                        <div className="maint-next-svc-comp">
                          {COMPONENT_LABELS[health.nextService.component] || health.nextService.component}
                        </div>
                      </div>
                      <div className="maint-next-svc-right">
                        <span className="maint-next-svc-value">{health.nextService.inKm.toLocaleString()}</span>
                        <span className="maint-next-svc-unit">km</span>
                      </div>
                    </div>
                  )}

                  <button
                    className="maint-board-card maint-coach-card"
                    onClick={() => navigate('/goal-assistant')}
                  >
                    <span className="maint-coach-footer-icon"><SparkleIcon size={32} color="#274dd3" /></span>
                    <span className="maint-coach-footer-text">
                      <span className="maint-coach-footer-title">Ask coach about your bike</span>
                      <span className="maint-coach-footer-subtitle">Maintenance and gear advice</span>
                    </span>
                    <span className="maint-coach-footer-chevron">›</span>
                  </button>
                </div>
              </div>

              {COMPONENT_GROUPS.map(group => {
                const items = group.ids
                  .map(id => health.components.find(c => c.id === id))
                  .filter(Boolean);
                if (items.length === 0) return null;
                const groupLabel = health.groupLabels?.[group.key] || GROUP_LABELS[group.key];
                return (
                  <div className="maint-column" key={group.key}>
                    <div className="maint-column-header">
                      <button
                        className="maint-section-title-row clickable"
                        onClick={() => openRename('group', group.key, health.groupLabels?.[group.key] || '')}
                      >
                        <span className="maint-section-title">{groupLabel}</span>
                        <EditIcon size={13} color="#C7C7CC" />
                      </button>
                    </div>
                    <div className="maint-column-cards">
                      {items.map(comp => {
                        const tint = STATUS_TINT[comp.status];
                        const compLabel = health.componentLabels?.[comp.id] || COMPONENT_LABELS[comp.id] || comp.id;
                        return (
                          <button
                            key={comp.id}
                            className="maint-board-card maint-component-card"
                            onClick={() => openDetail(comp)}
                          >
                            <div className="maint-card-name-row">
                              <span className="maint-card-name">{compLabel}</span>
                              {comp.status === 'critical' && (
                                <span className="maint-card-dot" style={{ backgroundColor: tint }} />
                              )}
                            </div>
                            <div className="maint-card-footer">
                              <div className="maint-card-bar-track">
                                <div className="maint-card-bar-fill" style={{ width: `${comp.healthPercent}%`, backgroundColor: tint }} />
                              </div>
                              <div className="maint-card-bottom">
                                <span className="maint-card-sub">~{comp.remainingKm.toLocaleString()} km</span>
                                <span className="maint-card-percent">{comp.healthPercent}%</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <Footer />

      {/* Detail sheet — mirrors the RN Animated slide-up Modal */}
      {detailComponent && (
        // T-6.5/W-42: backdrop → keyboard-dismissible, jsx-a11y
        // click-events-have-key-events/no-static-element-interactions.
        <div
          className={`maint-sheet-overlay ${sheetOpen ? 'open' : ''}`}
          onClick={closeDetail}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
              e.preventDefault();
              closeDetail();
            }
          }}
        >
          {/* eslint-disable-next-line -- jsx-a11y no-static-element-interactions/click-events-have-key-events:
              this onClick only stops the backdrop's close-on-click from bubbling; the sheet has its own Close button.
              (Bare disable so this also lints clean without eslint-plugin-jsx-a11y installed yet.) */}
          <div className={`maint-sheet ${sheetOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="maint-sheet-handle" />
            <div className="maint-sheet-header">
              <span className="maint-sheet-title">
                {health?.componentLabels?.[detailComponent.id] || COMPONENT_LABELS[detailComponent.id] || detailComponent.id}
              </span>
              <button className="maint-sheet-close" onClick={closeDetail} aria-label="Close">×</button>
            </div>

            <div className="maint-sheet-hero">
              <span className="maint-sheet-percent" style={{ color: STATUS_TINT[detailComponent.status] }}>
                {detailComponent.healthPercent}
              </span>
              <span className="maint-sheet-percent-sign" style={{ color: STATUS_TINT[detailComponent.status] }}>%</span>
              <span className="maint-sheet-percent-label">health</span>
            </div>

            <div className="maint-sheet-bar-track">
              <div
                className="maint-sheet-bar-fill"
                style={{ width: `${detailComponent.healthPercent}%`, backgroundColor: STATUS_TINT[detailComponent.status] }}
              />
            </div>

            <div className="maint-sheet-rows">
              <SheetRow label="Km since replacement" value={`${detailComponent.kmSinceReset.toLocaleString()} km`} />
              <SheetRow label="Effective km" value={`${detailComponent.effectiveKm.toLocaleString()} km`} />
              <SheetRow label="Base lifecycle" value={`${detailComponent.baseLifecycle.toLocaleString()} km`} />
              <SheetRow label="Remaining" value={`~${detailComponent.remainingKm.toLocaleString()} km`} />
              <div className="maint-sheet-divider" />
              <SheetRow label="Weight factor" value={`${detailComponent.weightFactor}`} />
              <SheetRow label="Style factor" value={`${detailComponent.styleFactor}`} />
            </div>

            <button className="maint-reset-btn" onClick={() => handleReset(detailComponent.id)}>
              Mark as Replaced
            </button>
          </div>
        </div>
      )}

      {/* Rename modal — shared for group headers and (currently hidden) component cards */}
      {renameTarget && (
        <div
          className="maint-center-overlay"
          onClick={closeRename}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
              e.preventDefault();
              closeRename();
            }
          }}
        >
          {/* eslint-disable-next-line -- jsx-a11y no-static-element-interactions/click-events-have-key-events:
              this onClick only stops the backdrop's close-on-click from bubbling; the sheet has its own Close/Save buttons.
              (Bare disable so this also lints clean without eslint-plugin-jsx-a11y installed yet.) */}
          <div className="maint-rename-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="maint-rename-title">
              {renameTarget.type === 'group' ? 'Name this section' : 'Name this part'}
            </div>
            <div className="maint-rename-hint">
              Give it your actual product name — it'll show here instead of the generic label.
            </div>
            <input
              className="maint-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="e.g. Hunt Carbon 45"
              aria-label={renameTarget.type === 'group' ? 'Name this section' : 'Name this part'}
            />
            <button
              className="maint-rename-save-btn"
              onClick={saveRename}
              disabled={!renameValue.trim() || renameSaving}
            >
              {renameSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
