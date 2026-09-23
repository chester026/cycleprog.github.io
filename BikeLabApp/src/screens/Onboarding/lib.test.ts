import {
  estimateRestingHrFromExperience,
  buildProfileData,
  INITIAL_FORM_DATA,
  type OnboardingFormData,
} from './lib';

describe('estimateRestingHrFromExperience', () => {
  it('returns the beginner estimate', () => {
    expect(estimateRestingHrFromExperience('beginner')).toBe(75);
  });

  it('returns the intermediate estimate', () => {
    expect(estimateRestingHrFromExperience('intermediate')).toBe(65);
  });

  it('returns the advanced estimate', () => {
    expect(estimateRestingHrFromExperience('advanced')).toBe(55);
  });

  it('falls back to 70 for an unknown/undefined level', () => {
    expect(estimateRestingHrFromExperience(undefined)).toBe(70);
    expect(estimateRestingHrFromExperience('pro')).toBe(70);
  });
});

describe('buildProfileData', () => {
  it('omits fields the rider left blank', () => {
    const data = buildProfileData(INITIAL_FORM_DATA);
    expect(data).toEqual({experience_level: 'intermediate'});
  });

  it('coerces every filled field to the right type', () => {
    const formData: OnboardingFormData = {
      height: '180',
      weight: '75.5',
      birth_date: '1994-06-20',
      gender: 'male',
      bike_weight: '8.2',
      max_hr: '190',
      resting_hr: '60',
      lactate_threshold: '165',
      experience_level: 'advanced',
    };

    expect(buildProfileData(formData)).toEqual({
      height: 180,
      weight: 75.5,
      birth_date: '1994-06-20',
      gender: 'male',
      bike_weight: 8.2,
      max_hr: 190,
      resting_hr: 60,
      lactate_threshold: 165,
      experience_level: 'advanced',
    });
  });

  it('always includes experience_level even when every other field is blank', () => {
    const data = buildProfileData({...INITIAL_FORM_DATA, experience_level: 'beginner'});
    expect(data).toEqual({experience_level: 'beginner'});
  });
});
