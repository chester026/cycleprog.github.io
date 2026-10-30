import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ageFromBirthDate } from '@bikelab/shared/calc';
import { useProfile, useUpdateProfile } from '../data/hooks';
import { Button, ErrorMessage, useToast } from '../ui';
import { logError } from '../lib/log';
import PersonalInfoForm from './profile/PersonalInfoForm';
import HrZonesCard from './profile/HrZonesCard';
import CoachMemoryCard from './profile/CoachMemoryCard';
import IntegrationsCard from './profile/IntegrationsCard';
import AccountDangerZone from './profile/AccountDangerZone';
import './ProfilePage.css';

// Tabs in sidebar order. `?tab=<id>` is the single source of truth for
// the active one, so coach cards (`/profile?tab=coach`) and the browser's
// back button both land on the right tab.
const TABS = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'account', label: 'Account Settings' },
  { id: 'heart-rate', label: 'Heart Rate Zones' },
  { id: 'training', label: 'Training Settings' },
  { id: 'coach', label: 'Coach memory' },
  { id: 'strava', label: 'Strava Integration' },
];
const DEFAULT_TAB = 'personal';
// Tabs without the shared "Save Changes" draft form.
const TABS_WITHOUT_SAVE = ['account', 'coach'];

function tabFromParams(params) {
  const tab = params.get('tab');
  return TABS.some((item) => item.id === tab) ? tab : DEFAULT_TAB;
}

// T-6.3 decomposition (audit W-21/W-23): each tab but "Personal"/"Training"
// (kept together — both are a handful of plain fields on the same
// page-level draft) lives in `./profile/*.jsx`; this file keeps the tab
// shell, the shared draft state, and the "Save Changes" mutation those two
// simple tabs use.
export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const activeTab = tabFromParams(searchParams);
  const selectTab = (tab) => setSearchParams(tab === DEFAULT_TAB ? {} : { tab });

  // WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the ends;
  // the newly focused tab is also selected (automatic activation).
  const handleTabKeyDown = (e, currentId) => {
    const index = TABS.findIndex((tab) => tab.id === currentId);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    let next;
    if (step) next = (index + step + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(TABS[next].id);
    document.getElementById(`profile-tab-${TABS[next].id}`)?.focus();
  };

  // T-6.2 (audit W-18): the profile query comes from the shared TanStack
  // Query cache now (no more page-local loadProfile()); `profile` here is
  // still a local editable draft, seeded from the query's data once it
  // arrives (see the seeding effect below), since the form lets the user
  // stage edits across fields before one Save Changes PUT.
  const { data: profileData, isLoading: loading, error: profileError, refetch: refetchProfile } = useProfile();
  const [profile, setProfile] = useState(null);
  const [profileSeededFor, setProfileSeededFor] = useState(false);
  if (profileData && !profileSeededFor) {
    setProfileSeededFor(true);
    setProfile(profileData);
  }
  useEffect(() => {
    if (profileError?.status === 401) navigate('/login');
  }, [profileError, navigate]);

  const updateProfile = useUpdateProfile();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Return from GET /link_strava (see server.js): `?strava=linked|error`.
  // Opens the Strava tab, pulls a fresh profile and strips the flag from
  // the URL in one replace so a reload doesn't repeat the refetch.
  useEffect(() => {
    const strava = searchParams.get('strava');
    if (strava !== 'linked' && strava !== 'error') return;
    if (strava === 'linked') {
      refetchProfile().then((r) => { if (r.data) setProfile(r.data); });
    } else {
      setErrors((prev) => ({ ...prev, strava: 'Failed to link Strava account. Please try again.' }));
    }
    setSearchParams({ tab: 'strava' }, { replace: true });
  }, [searchParams, setSearchParams, refetchProfile]);

  const handleInputChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));

    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (profile.height && (profile.height < 100 || profile.height > 250)) {
      newErrors.height = 'Height must be between 100 and 250 cm';
    }
    if (profile.weight && (profile.weight < 30 || profile.weight > 200)) {
      newErrors.weight = 'Weight must be between 30 and 200 kg';
    }
    if (profile.birth_date) {
      const age = ageFromBirthDate(profile.birth_date);
      if (age == null || age < 10 || age > 100) {
        newErrors.birth_date = 'Please enter a valid date of birth (age 10-100)';
      }
    }
    if (profile.bike_weight && (profile.bike_weight < 5 || profile.bike_weight > 25)) {
      newErrors.bike_weight = 'Bike weight must be between 5 and 25 kg';
    }
    if (profile.max_hr && (profile.max_hr < 100 || profile.max_hr > 220)) {
      newErrors.max_hr = 'Max HR must be between 100 and 220 bpm';
    }
    if (profile.resting_hr && (profile.resting_hr < 40 || profile.resting_hr > 100)) {
      newErrors.resting_hr = 'Resting HR must be between 40 and 100 bpm';
    }
    if (profile.lactate_threshold && (profile.lactate_threshold < 120 || profile.lactate_threshold > 200)) {
      newErrors.lactate_threshold = 'Lactate Threshold must be between 120 and 200 bpm';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    try {
      // `age` is server-derived from `birth_date` (never client-computed)
      // and stays in the draft only because it round-tripped in from GET —
      // strip it so the PUT can't clobber the server's own derivation.
      const { age: _age, ...body } = profile;
      await updateProfile.mutateAsync(body);
      toast.success('Profile updated successfully!');
    } catch (error) {
      logError(error, 'Error updating profile');
      setErrors({ submit: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-layout">
        {/* Sidebar Navigation */}
        <div className="profile-sidebar">
          <div className="profile-header">
            <h3>Profile Settings</h3>
         </div>
          <div className="profile-tabs" role="tablist" aria-label="Profile settings" aria-orientation="vertical">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`profile-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`profile-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`profile-tab-btn ${activeTab === tab.id ? 'profile-tab-active' : ''}`}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              >
                <span className="tab-text">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div
          className="profile-content"
          role="tabpanel"
          id={`profile-panel-${activeTab}`}
          aria-labelledby={`profile-tab-${activeTab}`}
        >
          {(activeTab === 'personal' || activeTab === 'training') && (
            <PersonalInfoForm tab={activeTab} profile={profile} errors={errors} onChange={handleInputChange} />
          )}

          {activeTab === 'account' && <AccountDangerZone profile={profile} />}

          {activeTab === 'heart-rate' && (
            <HrZonesCard profile={profile} errors={errors} onChange={handleInputChange} />
          )}

          {activeTab === 'coach' && <CoachMemoryCard />}

          {activeTab === 'strava' && (
            <IntegrationsCard
              profile={profile}
              onUnlinked={async () => {
                const refreshed = await refetchProfile();
                if (refreshed.data) setProfile(refreshed.data);
              }}
            />
          )}

          {errors.submit && <ErrorMessage>{errors.submit}</ErrorMessage>}

          {!TABS_WITHOUT_SAVE.includes(activeTab) && (
            <div className="profile-actions">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
