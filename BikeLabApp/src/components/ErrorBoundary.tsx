import React, {Component, ErrorInfo, ReactNode} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useTheme, Theme} from '../theme';
import {captureException} from '../monitoring/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// A-30: fallback screen shown by the boundary below. Split out as its own
// functional component (rather than inline in the class's render) purely
// so it can use `useTheme()` — class components can't call hooks.
const ErrorBoundaryFallback: React.FC<{onReset: () => void}> = ({onReset}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const styles = fallbackStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{t('common.somethingWentWrong')}</Text>
      <TouchableOpacity style={styles.button} onPress={onReset} testID="error-boundary-retry">
        <Text style={styles.buttonText}>{t('common.tryAgain')}</Text>
      </TouchableOpacity>
    </View>
  );
};

// Built per-render from the live `useTheme()` value (not the module-level
// `makeStyles` helper, which always uses the default theme) so a future
// light-mode `ThemeProvider` value actually reaches this fallback screen.
const fallbackStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing[24],
    },
    message: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.fontSize.xl,
      marginBottom: theme.spacing[20],
      textAlign: 'center',
    },
    button: {
      backgroundColor: theme.colors.icon.dark,
      paddingHorizontal: theme.spacing[20],
      paddingVertical: theme.spacing[12],
      borderRadius: theme.radii.sm,
    },
    buttonText: {
      color: theme.colors.text.inverse,
      fontSize: 15,
      fontWeight: '600',
    },
  });

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // A-30: report every caught crash to Sentry (no-op when disabled —
    // see src/monitoring/sentry.ts), in addition to the caller's own
    // onError (if any).
    captureException(error);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({hasError: false});
  };

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

export function withErrorBoundary<P extends object>(
  ScreenComponent: React.ComponentType<P>,
): React.FC<P> {
  const Wrapped: React.FC<P> = props => (
    <ErrorBoundary>
      <ScreenComponent {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${
    ScreenComponent.displayName || ScreenComponent.name || 'Component'
  })`;
  return Wrapped;
}
