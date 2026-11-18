// The Apple and Google buttons on LoginScreen (docs/plans/auth-providers.md
// §4.1). Drawn here as one pair — same pill, same height, mark and label
// centred (owner, 18.11.2026) — because each provider's native button has
// its own shape and alignment and cannot be made to match the other. Each
// shows only when the server can honour it (`useAuthProviders`). Hands the
// session to the screen; never touches tokens or navigation itself.
import React, {useState} from 'react';
import {View, Text, Image, TouchableOpacity, Alert, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {
  isAppleSignInSupported,
  signInWithApple,
  signInWithGoogle,
  type IdentitySession,
  type IdentitySignInResult,
} from '../../auth/identity';
import {useAuthProviders} from '../../data/hooks/useAuthProviders';
import {logger} from '../../lib/logger';
import {makeStyles, useTheme} from '../../theme';
import {GOOGLE_MARK} from './providerMarks';

// Apple's logo as the system font draws it: a private-use glyph that only
// Apple platforms render — which is the only place this button appears.
const APPLE_MARK = '';

const BUTTON_HEIGHT = 52;
const GOOGLE_MARK_SIZE = 18;

type Provider = 'apple' | 'google';

export interface SocialSignInProps {
  disabled?: boolean;
  onSignedIn: (session: IdentitySession) => void;
}

export const SocialSignIn: React.FC<SocialSignInProps> = ({disabled = false, onSignedIn}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const providers = useAuthProviders();
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);

  const showApple = providers.data?.apple === true && isAppleSignInSupported;
  const showGoogle = providers.data?.google === true;
  const locked = disabled || busyProvider !== null;

  const run = async (provider: Provider, signIn: () => Promise<IdentitySignInResult>) => {
    if (locked) return;
    setBusyProvider(provider);
    try {
      const result = await signIn();
      if (result.type === 'signed-in') onSignedIn(result.session);
    } catch (error) {
      logger.error('Provider sign-in failed:', error);
      Alert.alert(t('login.signInFailed'), t('login.signInFailedMessage'));
    } finally {
      setBusyProvider(null);
    }
  };

  if (!showApple && !showGoogle) return null;

  const spinner = <ActivityIndicator color={theme.colors.ink} />;

  return (
    <View style={styles.container} testID="login-social">
      {showApple ? (
        <TouchableOpacity
          testID="login-apple-button"
          accessibilityRole="button"
          style={styles.button}
          activeOpacity={0.85}
          disabled={locked}
          onPress={() => run('apple', signInWithApple)}>
          {busyProvider === 'apple' ? (
            spinner
          ) : (
            <>
              <Text style={styles.appleMark}>{APPLE_MARK}</Text>
              <Text style={styles.label}>{t('login.signInApple')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
      {showGoogle ? (
        <TouchableOpacity
          testID="login-google-button"
          accessibilityRole="button"
          style={styles.button}
          activeOpacity={0.85}
          disabled={locked}
          onPress={() => run('google', signInWithGoogle)}>
          {busyProvider === 'google' ? (
            spinner
          ) : (
            <>
              <Image testID="login-google-mark" source={GOOGLE_MARK} style={styles.googleMark} />
              <Text style={styles.label}>{t('login.signInGoogle')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    width: '100%',
    gap: theme.spacing[12],
  },
  button: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  // The glyph sits low in its line box; nudged up so it centres on the label.
  appleMark: {
    fontSize: 26,
    lineHeight: 29,
    marginTop: -2,
    color: theme.colors.ink,
  },
  googleMark: {
    width: GOOGLE_MARK_SIZE,
    height: GOOGLE_MARK_SIZE,
    resizeMode: 'contain',
  },
}));
