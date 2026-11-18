import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  Image,
  StyleSheet,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TokenStorage} from '../utils/api';
import {api, userProfile} from '../data/api';
import {logger} from '../lib/logger';
import {resolvePostAuthRoute} from '../navigation/resolvePostAuthRoute';
import {SocialSignIn} from './Login/SocialSignIn';
import {EmailSignInModal, type EmailSession} from './Login/EmailSignInModal';
import {SignLogo} from '../assets/img/logo/SignLogo';
import type {IdentitySession} from '../auth/identity';
import type {AppNavigationProp} from '../navigation/types';
import type {useAppRoute} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';

interface LoginScreenProps {
  navigation: AppNavigationProp;
  route?: ReturnType<typeof useAppRoute<'Login'>>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({navigation, route}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [checking, setChecking] = useState(true);

  // Проверяем, есть ли уже токен при загрузке
  useEffect(() => {
    const skipTokenCheck = route?.params?.skipTokenCheck;
    if (skipTokenCheck) {
      logger.debug('🚪 Skipping token check (signed out)');
      setChecking(false);
    } else {
      checkExistingToken();
    }
    // Run once on mount only — re-running on every `route.params` change
    // would re-trigger the token check after e.g. a Strava deep link
    // updates other params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link обрабатывается глобально в App.tsx

  const checkExistingToken = async () => {
    try {
      const token = await TokenStorage.getToken();
      if (token) {
        logger.debug('✅ Token found, checking onboarding...');
        try {
          const profile = await api.call(userProfile.get);
          const target = resolvePostAuthRoute(profile);
          logger.debug(`🚀 Navigating to ${target}`);
          navigation.replace(target);
        } catch {
          // Profile fetch failed — token may be invalid
          logger.debug('⚠️ Profile fetch failed, staying on login');
        }
      }
    } catch (error) {
      logger.error('Error checking token:', error);
    } finally {
      setChecking(false);
    }
  };

  // Email + password: the form lives in EmailSignInModal, which hands back
  // the session. Closed first so the form is not left over the next screen.
  const handleEmailSignedIn = async (session: EmailSession) => {
    setEmailFormVisible(false);
    logger.debug('✅ Login successful!');
    await TokenStorage.setTokens(session.token, session.refreshToken, true);
    navigation.replace('Main');
  };

  // Apple / Google: the session is already issued; a first-time rider goes
  // through onboarding, everyone else straight in.
  const handleProviderSignedIn = async (session: IdentitySession) => {
    await TokenStorage.setTokens(session.token, session.refreshToken, true);
    let target = resolvePostAuthRoute(null);
    try {
      target = resolvePostAuthRoute(await api.call(userProfile.get));
    } catch (error) {
      logger.debug('⚠️ Profile fetch after sign-in failed, going to Main', error);
    }
    navigation.replace(target);
  };

  if (checking) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.chart.series3} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="login-screen">
       <ImageBackground
          source={require('../assets/img/mostrecomended.webp')}
          style={styles.loginBackground}
          imageStyle={styles.loginImage}
        >
      <View style={styles.overlay} />
      
      <View style={styles.content}>
        <View style={styles.logo}>
          <SignLogo />
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        {/* The ways in, and nothing else: Apple, Google, then email — whose
            fields open in their own full-screen form (owner, 18.11.2026). A
            rider who used to sign in with Strava takes Apple or Google and
            connects Strava inside: the server folds the new account into
            the old one (docs/plans/auth-providers.md §3.5). */}
        <SocialSignIn onSignedIn={handleProviderSignedIn} />

        <TouchableOpacity
          testID="login-email-button"
          accessibilityRole="button"
          style={styles.button}
          onPress={() => setEmailFormVisible(true)}>
          <Text style={styles.buttonText}>{t('login.emailSignIn')}</Text>
        </TouchableOpacity>

        <View style={styles.stravaLogoContainer}>
          <Image source={require('../assets/img/shareTemplates/logos/ride_w.png')} style={styles.bottomLogo} />
        </View>
      </View>
      </ImageBackground>
      <EmailSignInModal
        visible={emailFormVisible}
        onClose={() => setEmailFormVisible(false)}
        onSignedIn={handleEmailSignedIn}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loginBackground: {
    flex: 1,
    resizeMode: 'cover',
  },
  logo: {
    marginBottom: 24,
  },
  loginImage: {
    resizeMode: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.4)',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
 
  title: {
    fontSize: 32,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: theme.colors.text.inverse,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 48,
  },
  button: {
    width: '100%',
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomLogo: {
    width: 80,
    height: 32,
    resizeMode: 'contain',
    opacity: 1,
  },
  stravaLogoContainer: {
    marginTop: 32,
    alignItems: 'center',
    opacity: 1,
    position: 'absolute',
    bottom: 40,
  },
}));

