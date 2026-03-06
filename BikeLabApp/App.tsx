import React, {useState, useEffect, useCallback, createRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Image, View, Text, Linking, Modal, Alert} from 'react-native';
import {SplashLoader, SplashProvider} from './src/components/SplashLoader';
import {BlurView} from '@react-native-community/blur';
import {apiFetch, TokenStorage, setSessionExpiredHandler} from './src/utils/api';
import {initRevenueCat} from './src/utils/RevenueCat';
import {initI18n} from './src/i18n/i18n';

export const navigationRef = createRef<any>();
import {DirectionsBikeIcon} from './src/assets/img/icons/DirectionsBikeIcon';
import {CardioLoadIcon} from './src/assets/img/icons/CardioLoadIcon';
import {AltitudeIcon} from './src/assets/img/icons/AltitudeIcon';
import {HomeIcon} from './src/assets/img/icons/HomeIcon';
import {LoginScreen} from './src/screens/LoginScreen';
import {ActivitiesScreen} from './src/screens/ActivitiesScreen';
import {AnalysisScreen} from './src/screens/AnalysisScreen';
import {GoalAssistantScreen} from './src/screens/GoalAssistantScreen';
import {GoalDetailsScreen} from './src/screens/GoalDetailsScreen';
import {GarageScreen} from './src/screens/GarageScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {PersonalInfoScreen} from './src/screens/PersonalInfoScreen';
import {AccountSettingsScreen} from './src/screens/AccountSettingsScreen';
import {HRZonesScreen} from './src/screens/HRZonesScreen';
import {TrainingSettingsScreen} from './src/screens/TrainingSettingsScreen';
import {StravaIntegrationScreen} from './src/screens/StravaIntegrationScreen';
import {RideAnalyticsScreen} from './src/screens/RideAnalyticsScreen';
import {AchievementsScreen} from './src/screens/AchievementsScreen';
import {BikeGarageScreen} from './src/screens/BikeGarageScreen';
import {OnboardingScreen} from './src/screens/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const GoalsStack = createNativeStackNavigator();
const GarageStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function GoalsStackScreen() {
  return (
    <GoalsStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#0a0a0a'},
      }}>
      <GoalsStack.Screen name="GoalAssistant" component={GoalAssistantScreen} />
      <GoalsStack.Screen name="GoalDetails" component={GoalDetailsScreen} />
    </GoalsStack.Navigator>
  );
}

function GarageStackScreen() {
  return (
    <GarageStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#fafafa'},
      }}>
      <GarageStack.Screen name="Garage" component={GarageScreen} />
      <GarageStack.Screen name="BikeGarage" component={BikeGarageScreen} />
      <GarageStack.Screen name="Achievements" component={AchievementsScreen} />
    </GarageStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#f2f2f7'},
      }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
      <ProfileStack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <ProfileStack.Screen name="HRZones" component={HRZonesScreen} />
      <ProfileStack.Screen name="TrainingSettings" component={TrainingSettingsScreen} />
      <ProfileStack.Screen name="StravaIntegration" component={StravaIntegrationScreen} />
      <ProfileStack.Screen name="Achievements" component={AchievementsScreen} />
    </ProfileStack.Navigator>
  );
}

const ProfileIcon: React.FC<{color: string; size: number}> = ({color, size}) => {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        if (profile?.avatar) {
          setAvatar(profile.avatar);
        }
      } catch (error) {
        console.log('Failed to load avatar');
      }
    };
    loadAvatar();
  }, []);

  if (avatar) {
    return (
      <Image
        source={{uri: avatar}}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 0,
          borderColor: color,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.3,
      }}
    />
  );
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          height: 74,
          paddingBottom: 24,
          paddingTop: 4,
         paddingHorizontal: 16,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            style={{flex: 1}}
            blurType="dark"
            blurAmount={10}
            reducedTransparencyFallbackColor="rgba(23, 23, 23, 0.98)"
          />
        ),
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#9a9a9a',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}>
         <Tab.Screen
        name="GarageTab"
        component={GarageStackScreen}
        options={{
          tabBarLabel: 'Garage',
          tabBarIcon: ({color, size}) => (
            <HomeIcon size={size} color={color} />
          ),
        }}
      />
     <Tab.Screen
      name="GoalsTab"
      component={GoalsStackScreen}
      options={{
        tabBarLabel: 'Goals',
        tabBarIcon: ({color, size}) => (
          <AltitudeIcon size={size} color={color} />
        ),
      }}
    />
      <Tab.Screen
        name="AnalysisTab"
        component={AnalysisScreen}
        options={{
          tabBarLabel: 'Analysis',
          tabBarIcon: ({color, size}) => (
            <CardioLoadIcon size={size} color={color} />
          ),
        }}
      />
     
     <Tab.Screen
        name="ActivitiesTab"
        component={ActivitiesScreen}
        options={{
          tabBarLabel: 'Activities',
          tabBarIcon: ({color, size}) => (
            <DirectionsBikeIcon size={size} color={color} />
          ),
        }}
      /> 
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({color, size}) => (
            <ProfileIcon color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function resetToLogin() {
  navigationRef.current?.reset({
    index: 0,
    routes: [{name: 'Login', params: {skipTokenCheck: true}}],
  });
}

setSessionExpiredHandler(() => {
  const i18n = require('./src/i18n/i18n').default;
  Alert.alert(
    i18n.t('session.expired'),
    i18n.t('session.expiredMessage'),
    [{text: i18n.t('common.ok'), onPress: () => resetToLogin()}],
  );
});

function App(): React.JSX.Element {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const hideSplash = useCallback(() => setSplashVisible(false), []);

  useEffect(() => {
    const initApp = async () => {
      await initI18n();

      try {
        await initRevenueCat();
      } catch {
        // RevenueCat init failed - continue without it
      }

      // Проверяем токен и статус онбординга
      try {
        const token = await TokenStorage.getToken();
        if (!token) {
          setInitialRoute('Login');
          return;
        }
        // Check onboarding status
        try {
          const profile = await apiFetch('/api/user-profile');
          setInitialRoute(profile.onboarding_completed ? 'Main' : 'Onboarding');
        } catch {
          // Token invalid or network error — go to login
          setInitialRoute('Login');
        }
      } catch {
        setInitialRoute('Login');
      }
    };

    initApp();
  }, []);
  
  // Глобальный обработчик deep links для Strava OAuth
  useEffect(() => {
    console.log('🌐 [App] Global deep link handler initialized');
    console.log('🌐 [App] Starting deep link setup...');
    
    const handleDeepLink = async (event: {url: string}) => {
      const url = event.url;
      console.log('');
      console.log('========================================');
      console.log('🔗🔗🔗 [App] DEEP LINK RECEIVED!!!');
      console.log('🔗 [App] Deep link URL:', url);
      console.log('🔍 [App] Full URL (JSON):', JSON.stringify(url));
      console.log('========================================');
      console.log('');
      
      // Проверяем, это deep link для авторизации (custom scheme или Universal Link)
      if (url.includes('bikelab://') || url.includes('bikelab.app/auth')) {
        console.log('✅ [App] Auth deep link detected!');
        
        try {
          // Пробуем несколько вариантов извлечения токена
          let token = null;
          
          // Вариант 1: ?token=... (для bikelab:// и https://)
          const tokenMatch1 = url.match(/[?&]token=([^&]+)/);
          if (tokenMatch1 && tokenMatch1[1]) {
            token = decodeURIComponent(tokenMatch1[1]);
          }
          
          // Вариант 2: /auth/TOKEN (fallback)
          const tokenMatch2 = url.match(/\/auth\/([^?&]+)/);
          if (!token && tokenMatch2 && tokenMatch2[1]) {
            token = decodeURIComponent(tokenMatch2[1]);
          }
          
          if (token) {
            console.log('✅ [App] Token extracted, length:', token.length);
            console.log('🔑 [App] Token preview:', token.substring(0, 20) + '...');
            
            await TokenStorage.setToken(token, true);
            console.log('✅ [App] Token saved to storage');
            
            // Проверяем, что токен действительно сохранился
            const savedToken = await TokenStorage.getToken();
            console.log('🔍 [App] Verification - token saved:', !!savedToken);
            
            // Check onboarding status before navigating
            let target = 'Main';
            try {
              const profile = await apiFetch('/api/user-profile');
              target = profile.onboarding_completed ? 'Main' : 'Onboarding';
            } catch {
              // If profile fetch fails, go to Main (will handle later)
            }
            console.log(`🚀 [App] Navigating to ${target}...`);
            navigationRef.current?.reset({
              index: 0,
              routes: [{name: target}],
            });
          } else {
            console.error('❌ [App] Token not found in URL');
            console.error('❌ [App] URL was:', url);
          }
        } catch (error) {
          console.error('❌ [App] Error processing deep link:', error);
        }
      } else {
        console.log('ℹ️ [App] Not an auth deep link, ignoring');
      }
    };

    // Подписываемся на deep links
    console.log('');
    console.log('📡 [App] Adding deep link listener...');
    const subscription = Linking.addEventListener('url', handleDeepLink);
    console.log('✅ [App] Deep link listener added successfully!');
    console.log('✅ [App] Listening for: bikelab:// and bikelab.app/auth');
    console.log('');

    // Проверяем initial URL при запуске
    console.log('🔍 [App] Checking for initial URL...');
    Linking.getInitialURL().then((url: string | null) => {
      console.log('🔍 [App] getInitialURL result:', url);
      if (url) {
        console.log('🔗 [App] Initial URL detected:', url);
        console.log('🔗 [App] Processing initial URL...');
        handleDeepLink({url});
      } else {
        console.log('ℹ️ [App] No initial URL (app opened normally)');
      }
    }).catch((err) => {
      console.error('❌ [App] Error getting initial URL:', err);
    });
    
    console.log('✅ [App] Deep link setup complete!');

    return () => {
      console.log('🔌 [App] Deep link listener removed');
      subscription.remove();
    };
  }, []);

  // For Login/Onboarding routes, hide splash immediately
  useEffect(() => {
    if (initialRoute && initialRoute !== 'Main') {
      setSplashVisible(false);
    }
  }, [initialRoute]);

  return (
    <SplashProvider value={{hideSplash}}>
      {splashVisible && (
        <Modal visible animationType="fade" statusBarTranslucent>
          <SplashLoader />
        </Modal>
      )}
      {initialRoute !== null && (
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              contentStyle: {backgroundColor: '#0a0a0a'},
            }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="RideAnalytics" component={RideAnalyticsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SplashProvider>
  );
}

export default App;
