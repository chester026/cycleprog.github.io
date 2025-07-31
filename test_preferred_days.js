// Простой тест для проверки функциональности preferred_days
const testUserProfile = {
  experience_level: 'intermediate',
  time_available: 5,
  workouts_per_week: 4,
  preferred_days: ['monday', 'wednesday', 'friday', 'saturday'],
  preferred_training_types: ['endurance', 'tempo', 'intervals'],
  seasonal_preferences: {}
};

console.log('Test User Profile:', testUserProfile);
console.log('Selected training days:', testUserProfile.preferred_days);
console.log('Number of workouts:', testUserProfile.workouts_per_week);
console.log('Days match workouts:', testUserProfile.preferred_days.length === testUserProfile.workouts_per_week);

// Тест валидации
const validatePreferredDays = (profile) => {
  const { preferred_days, workouts_per_week } = profile;
  
  if (preferred_days.length > workouts_per_week) {
    console.error('❌ Error: Too many preferred days selected');
    return false;
  }
  
  if (preferred_days.length < workouts_per_week) {
    console.warn('⚠️ Warning: Fewer days selected than workouts per week');
  }
  
  console.log('✅ Validation passed');
  return true;
};

validatePreferredDays(testUserProfile); 