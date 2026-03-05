import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import ru from './ru.json';

const LANGUAGE_KEY = '@app_language';

const resources = {
  en: {translation: en},
  ru: {translation: ru},
};

const getDeviceLanguage = (): string => {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const lang = locales[0].languageCode;
    if (lang === 'ru') return 'ru';
  }
  return 'en';
};

const initI18n = async () => {
  let savedLanguage: string | null = null;
  try {
    savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {}

  await i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage || getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
};

export const changeLanguage = async (lang: string) => {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
};

export {initI18n, LANGUAGE_KEY};
export default i18n;
