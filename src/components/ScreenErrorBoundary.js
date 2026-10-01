import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Keeps one screen's crash from blanking the whole app (white screen). Shows a
// friendly card with recovery buttons -- never the raw error -- and logs the
// real error to the console for debugging.
export default class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[PawCruz] Screen "${this.props.screenName}" crashed:`, error, info?.componentStack);
  }

  retry = () => this.setState({ hasError: false });

  goHome = () => {
    this.setState({ hasError: false });
    this.props.onGoHome?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>This page couldn't be displayed. Your data is safe — please try again.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={this.retry} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Try again</Text>
          </TouchableOpacity>
          {this.props.onGoHome ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={this.goHome} activeOpacity={0.9}>
              <Text style={styles.secondaryText}>Go to Home</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7fbfc', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: '#ffffff', borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: '#dceef8', alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#123a5e', marginBottom: 8 },
  message: { fontSize: 14, fontWeight: '600', color: '#5f7f94', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  primaryButton: { width: '100%', minHeight: 48, borderRadius: 16, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { width: '100%', minHeight: 48, borderRadius: 16, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6fb' },
  secondaryText: { color: '#2c6ba3', fontSize: 15, fontWeight: '800' },
});
