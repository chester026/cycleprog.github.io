import i18n from './i18n';

export const getDateLocale = (): string => {
  return i18n.language === 'ru' ? 'ru-RU' : 'en-US';
};

export const getDateLocaleShort = (): string => {
  return i18n.language === 'ru' ? 'ru-RU' : 'en-GB';
};
