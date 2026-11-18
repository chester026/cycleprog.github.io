// Email + password sign-in, opened by LoginScreen's "Sign In with Email"
// button (owner, 18.11.2026: the fields left the login screen, which now
// shows only the ways in). Full-screen, so the keyboard never covers a field
// or the submit button. Owns the form and the request and hands the session
// to the screen — like SocialSignIn, it never touches tokens or navigation.
import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {api, auth} from '../../data/api';
import {WEB_BASE_URL} from '../../config';
import {PrimaryButton} from '../../components/PrimaryButton';
import {KEYBOARD_DISMISS_PROPS} from '../../constants/keyboard';
import {logger} from '../../lib/logger';
import {useTrackOpenModal} from '../../lib/openModals';
import {makeStyles, useTheme, withOpacity} from '../../theme';

const CLOSE_HIT_SLOP = {top: 12, bottom: 12, left: 12, right: 12};

export interface EmailSession {
  token: string;
  refreshToken: string;
}

export interface EmailSignInModalProps {
  visible: boolean;
  onClose: () => void;
  onSignedIn: (session: EmailSession) => void;
}

export const EmailSignInModal: React.FC<EmailSignInModalProps> = ({visible, onClose, onSignedIn}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  useTrackOpenModal(visible);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput | null>(null);

  // A closed form keeps the address (a retry is the likely next step) but
  // never a typed password.
  useEffect(() => {
    if (!visible) setPassword('');
  }, [visible]);

  const handleSubmit = async () => {
    if (loading) return;
    const address = email.trim();
    if (!address || !password) {
      Alert.alert(t('common.error'), t('login.errorEmpty'));
      return;
    }

    setLoading(true);
    try {
      const response = await api.call(auth.login, {body: {email: address, password}});
      if (response.token) {
        onSignedIn({token: response.token, refreshToken: response.refreshToken});
      } else {
        Alert.alert(t('common.error'), t('login.errorInvalidResponse'));
      }
    } catch (error) {
      logger.error('❌ Login error:', error);
      const message = error instanceof Error && error.message ? error.message : t('login.loginFailedMessage');
      Alert.alert(t('login.loginFailed'), message);
    } finally {
      setLoading(false);
    }
  };

  // A request in flight finishes on its own; closing under it would sign the
  // rider in behind a form they had just dismissed.
  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} testID="login-email-modal">
        {/* A Modal is full-screen, so no keyboardVerticalOffset: padding alone
            keeps the submit button above the keyboard. */}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity
              testID="login-email-close"
              accessibilityRole="button"
              hitSlop={CLOSE_HIT_SLOP}
              onPress={handleClose}
              disabled={loading}>
              <Text style={styles.closeText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            {...KEYBOARD_DISMISS_PROPS}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('login.emailSignIn')}</Text>
            <Text style={styles.hint}>
              {t('login.emailHint')}
              <Text style={styles.hintLink} onPress={() => Linking.openURL(WEB_BASE_URL)}>
                {t('login.emailHintLink')}
              </Text>
            </Text>

            <TextInput
              testID="login-email-input"
              style={styles.input}
              placeholder={t('login.email')}
              placeholderTextColor={theme.colors.text.muted}
              value={email}
              onChangeText={setEmail}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!loading}
            />
            <TextInput
              ref={passwordRef}
              testID="login-password-input"
              style={styles.input}
              placeholder={t('login.password')}
              placeholderTextColor={theme.colors.text.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!loading}
            />

            <PrimaryButton
              title={t('login.emailSubmit')}
              onPress={handleSubmit}
              loading={loading}
              style={styles.submit}
              testID="login-submit-button"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  flex: {flex: 1},
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing[24],
    paddingVertical: theme.spacing[14],
  },
  closeText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '600',
    color: withOpacity(theme.colors.text.inverse, 0.7),
  },
  content: {
    paddingHorizontal: theme.spacing[24],
    paddingTop: theme.spacing[32],
    paddingBottom: theme.spacing[24],
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[8],
  },
  hint: {
    fontSize: theme.typography.fontSize.lg,
    lineHeight: 20,
    color: withOpacity(theme.colors.text.inverse, 0.5),
    marginBottom: theme.spacing[32],
  },
  hintLink: {
    color: withOpacity(theme.colors.text.inverse, 0.8),
    textDecorationLine: 'underline',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[16],
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[12],
  },
  submit: {
    marginTop: theme.spacing[12],
  },
}));
