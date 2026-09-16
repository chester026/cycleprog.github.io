import React, {Component, ErrorInfo, ReactNode} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import i18n from '../i18n/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({hasError: false});
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>{i18n.t('common.somethingWentWrong')}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>{i18n.t('common.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#333333',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

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
