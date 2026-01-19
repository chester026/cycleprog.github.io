import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  ImageBackground,
  Image,
} from 'react-native';
import {apiFetch, TokenStorage} from '../utils/api';
import {StravaLogo} from '../assets/img/logo/StravaLogo';

interface LoginScreenProps {
  navigation: any;
  route?: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({navigation, route}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Проверяем, есть ли уже токен при загрузке
  useEffect(() => {
    // @ts-ignore
    const skipTokenCheck = route?.params?.skipTokenCheck;
    if (skipTokenCheck) {
      console.log('🚪 Skipping token check (signed out)');
      setChecking(false);
    } else {
      checkExistingToken();
    }
  }, []);

  // Deep link обрабатывается глобально в App.tsx

  const checkExistingToken = async () => {
    try {
      const token = await TokenStorage.getToken();
      if (token) {
        console.log('✅ Token found, navigating to Main...');
        navigation.replace('Main');
      }
    } catch (error) {
      console.error('Error checking token:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Logging in...');
      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password}),
      });

      if (response.token) {
        console.log('✅ Login successful!');
        await TokenStorage.setToken(response.token, true);
        navigation.replace('Main');
      } else {
        Alert.alert('Error', 'Invalid response from server');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error);
      Alert.alert('Login Failed', error.message || 'Please check your credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleStravaLogin = () => {
    const clientId = '165560';
    // Всегда используем production для OAuth (Strava не разрешает локальные IP)
    // API запросы пойдут на локальный сервер через __DEV__ в api.ts
    const redirectUri = 'https://bikelab.app/exchange_token?mobile=true';
    const scope = 'activity:read_all,profile:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&approval_prompt=auto`;
    
    console.log('🚴 Opening Strava OAuth...');
    console.log('📍 Redirect URI:', redirectUri);
    console.log('🔗 Auth URL:', authUrl);
    Linking.openURL(authUrl).catch((err) => {
      console.error('Failed to open Strava URL:', err);
      Alert.alert('Error', 'Failed to open Strava authorization page');
    });
  };

  if (checking) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5E00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
       <ImageBackground 
          source={require('../assets/img/mostrecomended.webp')}
          style={styles.loginBackground}
          imageStyle={styles.loginImage}
        >
      <View style={styles.overlay} />
      
      <View style={styles.content}>
      <Image source={require('../assets/img/logo/BLWhiteVert.png')} style={styles.logoImage} />
        <Text style={styles.title}>Bike Lab</Text>
        <Text style={styles.subtitle}>Go faster with Strava account</Text>

       
        <TouchableOpacity
          style={styles.stravaButton}
          onPress={handleStravaLogin}
          disabled={loading}>
          <Text style={styles.stravaButtonText}>Sign in with Strava</Text>
        </TouchableOpacity>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or use Email</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />
 <Text style={styles.hint}>
          Use your BikeLab credentials from{' '}
          <Text 
            style={styles.hintLink}
            onPress={() => Linking.openURL('https://bikelab.app')}
          >
            bikelab.app
          </Text>
        </Text>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In with Email</Text>
          )}
        </TouchableOpacity>

       

        <View style={styles.stravaLogoContainer}>
          <StravaLogo width={80} height={48} />
        </View>
      </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loginBackground: {
    flex: 1,
    resizeMode: 'cover',
  },
  logoImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
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
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
 
  title: {
    fontSize: 26,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#fff',
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
  input: {
    backgroundColor: 'rgba(13, 13, 15, 0.9)',
    padding: 16,
    width: '100%',
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  button: {
  
    width: '100%',
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
   
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dividerText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 16,
  },
  stravaButton: {
    backgroundColor: '#fc5200',
    width: '100%',
    padding: 16,
    alignItems: 'center',
  },
  stravaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 4,
  },
  hintLink: {
    color: 'rgba(255, 255, 255, 0.7)',
    textDecorationLine: 'underline',
  },
  stravaLogoContainer: {
    marginTop: 32,
    alignItems: 'center',
    opacity: 1,
    position: 'absolute',
    bottom: 32,
  },
});

