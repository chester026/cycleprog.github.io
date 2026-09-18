import React, { useEffect, useState } from 'react';
import { useProfile, useUpdateProfile } from '../../data/hooks';
import { useToast } from '../../ui';
import { queryClient } from '../../data/queryClient';
import { queryKeys } from '../../data/keys';
import styles from './ProfileSettingsForm.module.css';

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

/**
 * "Personal settings" panel for the training plan (T-6.3, audit W-21):
 * experience level, weekly time budget, workouts/week and preferred days.
 * Self-contained — owns its own profile fetch/save via `useProfile` /
 * `useUpdateProfile` (rather than the parent threading `userProfile` +
 * `savingProfile` state through props, as the old monolithic component did).
 *
 * Saving a profile also invalidates the training-plan query: the generated
 * plan is derived server-side from the profile, so the calendar above this
 * form needs to refetch it (this mirrors the original's explicit
 * `loadTrainingPlan()` call after a successful profile save).
 */
export function ProfileSettingsForm({ open, onSaved }) {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const [form, setForm] = useState(profile || null);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  if (!open || !form) return null;

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    updateProfile.mutate(form, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlan });
        onSaved?.();
      },
      onError: () => toast.error('Failed to save settings'),
    });
  };

  const preferredDays = form.preferred_days || [];
  const workoutsPerWeek = form.workouts_per_week || 5;

  const toggleDay = (dayKey, checked) => {
    if (checked) {
      if (preferredDays.length >= workoutsPerWeek) {
        toast.info(`You can only select up to ${workoutsPerWeek} training days per week.`);
        return;
      }
      handleChange('preferred_days', [...preferredDays, dayKey]);
    } else {
      handleChange('preferred_days', preferredDays.filter((d) => d !== dayKey));
    }
  };

  return (
    <div className="profile-settings">
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Experience Level:</label>
          <select
            className={styles.select}
            value={form.experience_level || 'intermediate'}
            onChange={(e) => handleChange('experience_level', e.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Training Time (hours per week):</label>
          <input
            className={styles.input}
            type="number"
            min="1"
            max="10"
            value={form.time_available || 5}
            onChange={(e) => handleChange('time_available', parseInt(e.target.value, 10))}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Number of Workouts per Week:</label>
          <select
            className={styles.select}
            value={workoutsPerWeek}
            onChange={(e) => {
              const newWorkoutsPerWeek = parseInt(e.target.value, 10);
              if (newWorkoutsPerWeek < preferredDays.length) {
                handleChange('preferred_days', preferredDays.slice(0, newWorkoutsPerWeek));
              }
              handleChange('workouts_per_week', newWorkoutsPerWeek);
            }}
          >
            <option value="3">3 workouts</option>
            <option value="4">4 workouts</option>
            <option value="5">5 workouts</option>
            <option value="6">6 workouts</option>
            <option value="7">7 workouts</option>
          </select>
        </div>

        <div className={styles.fieldFull}>
          <label className={styles.labelSpaced}>Preferred Training Days:</label>
          <div className={styles.daysGrid}>
            {DAYS.map((day) => (
              <label key={day.key} className={`day-checkbox ${preferredDays.includes(day.key) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={preferredDays.includes(day.key)}
                  onChange={(e) => toggleDay(day.key, e.target.checked)}
                  style={{ margin: 0 }}
                />
                {day.label}
              </label>
            ))}
          </div>
          <div className={styles.daysHint}>Selected days will have training sessions. Other days will be rest days.</div>
          <div className={styles.daysSelectedCount}>
            Selected: {preferredDays.length} / {workoutsPerWeek} days
          </div>
        </div>

        <button type="submit" className={styles.submit} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

export default ProfileSettingsForm;
