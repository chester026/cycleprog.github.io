import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile, useUpdateProfile } from '../data/hooks';
import { useToast } from '../ui';
import PersonalInfoForm from './profile/PersonalInfoForm';
import HrZonesCard from './profile/HrZonesCard';
import IntegrationsCard from './profile/IntegrationsCard';
import AccountDangerZone from './profile/AccountDangerZone';
import './ProfilePage.css';

// T-6.3 decomposition (audit W-21/W-23): this file used to hold all five
// tabs' JSX inline (544 lines) plus its own `alert`/`confirm` calls. Each
// tab but "Personal"/"Training" (kept together here — both are a handful
// of plain fields on the same page-level draft) now lives in
// `./profile/*.jsx`; this file keeps the tab shell, the shared draft
// state, and the "Save Changes" mutation those two simple tabs use.
export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const getInitialTab = () => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');
    if (tab && ['personal', 'account', 'heart-rate', 'training', 'strava'].includes(tab)) {
      return tab;
    }
    return 'personal';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());

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

  // Обработка изменений URL параметров (для навигации браузера)
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');

    if (tab && ['personal', 'account', 'heart-rate', 'training', 'strava'].includes(tab)) {
      setActiveTab(tab);
    } else if (!tab) {
      setActiveTab('personal');
    }
  }, [location.search]);

  // Возврат из GET /link_strava (см. server.js): ?strava=linked|error.
  // Открываем вкладку Strava, тянем свежий профиль и убираем query.
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const strava = urlParams.get('strava');
    if (strava === 'linked' || strava === 'error') {
      setActiveTab('strava');
      if (strava === 'linked') {
        refetchProfile().then((r) => { if (r.data) setProfile(r.data); });
      } else {
        setErrors((prev) => ({ ...prev, strava: 'Failed to link Strava account. Please try again.' }));
      }
      urlParams.delete('strava');
      const rest = urlParams.toString();
      navigate(`/profile${rest ? `?${rest}` : ''}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

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
    if (profile.age && (profile.age < 10 || profile.age > 100)) {
      newErrors.age = 'Age must be between 10 and 100 years';
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
      await updateProfile.mutateAsync(profile);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
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
          <div className="profile-tabs">
            <button
              id="profile-tab-btn"
              className={`profile-tab-btn ${activeTab === 'personal' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <span className="tab-text">Personal Information</span>
            </button>
            <button
              className={`profile-tab-btn ${activeTab === 'account' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <span className="tab-text">Account Settings</span>
            </button>
            <button
              className={`profile-tab-btn ${activeTab === 'heart-rate' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('heart-rate')}
            >
              <span className="tab-text">Heart Rate Zones</span>
            </button>
            <button
              id="training-tab-btn"
              className={`profile-tab-btn ${activeTab === 'training' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('training')}
            >
              <span className="tab-text">Training Settings</span>
            </button>
            <button
              className={`profile-tab-btn ${activeTab === 'strava' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('strava')}
            >
              <span className="tab-text">Strava Integration</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="profile-content">
          {(activeTab === 'personal' || activeTab === 'training') && (
            <PersonalInfoForm tab={activeTab} profile={profile} errors={errors} onChange={handleInputChange} />
          )}

          {activeTab === 'account' && <AccountDangerZone profile={profile} />}

          {activeTab === 'heart-rate' && (
            <HrZonesCard profile={profile} errors={errors} onChange={handleInputChange} />
          )}

          {activeTab === 'strava' && (
            <IntegrationsCard
              profile={profile}
              onUnlinked={async () => {
                const refreshed = await refetchProfile();
                if (refreshed.data) setProfile(refreshed.data);
              }}
            />
          )}

          {errors.submit && (
            <div className="error-message">
              {errors.submit}
            </div>
          )}

          {activeTab !== 'account' && (
            <div className="profile-actions">
              <button
                className="accent-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
