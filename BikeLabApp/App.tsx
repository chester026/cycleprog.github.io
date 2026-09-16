import React, {useState, useEffect, useCallback, createRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Image, View, Text, Linking, Modal, Alert} from 'react-native';
import {SplashLoader, SplashProvider} from './src/components/SplashLoader';
import ErrorBoundary, {withErrorBoundary} from './src/components/ErrorBoundary';
import {BlurView} from '@react-native-community/blur';
import {apiFetch, TokenStorage, setSessionExpiredHandler} from './src/utils/api';
import {emitStravaLinked} from './src/auth/strava';
import {initI18n} from './src/i18n/i18n';
import {AppDataProvider} from './src/contexts/AppDataContext';
import {DEFAULT_TAB_BAR_STYLE} from './src/constants/tabBar';
import {SafeAreaProvider} from 'react-native-safe-area-context';

export const navigationRef = createRef<any>();
import {CalendarIcon} from './src/assets/img/icons/CalendarIcon';
import {CardioLoadIcon} from './src/assets/img/icons/CardioLoadIcon';
import {SparkleIcon} from './src/assets/img/icons/SparkleIcon';
import {HomeIcon} from './src/assets/img/icons/HomeIcon';
import {LoginScreen} from './src/screens/LoginScreen';
import {CalendarScreen} from './src/screens/CalendarScreen';
import {AnalysisScreen} from './src/screens/AnalysisScreen';
import {CoachChatScreen} from './src/screens/CoachChatScreen';
import {GoalDetailsScreen} from './src/screens/GoalDetailsScreen';
import {GarageScreen} from './src/screens/GarageScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {PersonalInfoScreen} from './src/screens/PersonalInfoScreen';
import {AccountSettingsScreen} from './src/screens/AccountSettingsScreen';
import {HRZonesScreen} from './src/screens/HRZonesScreen';
import {TrainingSettingsScreen} from './src/screens/TrainingSettingsScreen';
import {StravaIntegrationScreen} from './src/screens/StravaIntegrationScreen';
import {AppleHealthScreen} from './src/screens/AppleHealthScreen';
import {OuraIntegrationScreen} from './src/screens/OuraIntegrationScreen';
import {RideAnalyticsScreen} from './src/screens/RideAnalyticsScreen';
import {AchievementsScreen} from './src/screens/AchievementsScreen';
import {ActivitiesScreen} from './src/screens/ActivitiesScreen';
import {BikeGarageScreen} from './src/screens/BikeGarageScreen';
import {OnboardingScreen} from './src/screens/OnboardingScreen';
import {logger} from './src/lib/logger';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const GoalsStack = createNativeStackNavigator();
const GarageStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const CalendarStack = createNativeStackNavigator();

function GoalsStackScreen() {
  return (
    <GoalsStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#0a0a0a'},
      }}>
      <GoalsStack.Screen name="CoachChat" component={CoachChatScreen} />
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
      <GarageStack.Screen name="Activities" component={ActivitiesScreen} />
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
      <ProfileStack.Screen name="AppleHealth" component={AppleHealthScreen} />
      <ProfileStack.Screen name="OuraIntegration" component={OuraIntegrationScreen} />
      <ProfileStack.Screen name="Achievements" component={AchievementsScreen} />
    </ProfileStack.Navigator>
  );
}

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#fafafa'},
      }}>
      <CalendarStack.Screen name="Calendar" component={CalendarScreen} />
    </CalendarStack.Navigator>
  );
}

const GarageTabScreen = withErrorBoundary(GarageStackScreen);
const GoalsTabScreen = withErrorBoundary(GoalsStackScreen);
const AnalysisTabScreen = withErrorBoundary(AnalysisScreen);
const CalendarTabScreen = withErrorBoundary(CalendarStackScreen);
const ProfileTabScreen = withErrorBoundary(ProfileStackScreen);

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
        logger.debug('Failed to load avatar');
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
        tabBarStyle: DEFAULT_TAB_BAR_STYLE,
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
        component={GarageTabScreen}
        options={{
          tabBarLabel: 'Garage',
          tabBarIcon: ({color, size}) => (
            <HomeIcon size={size} color={color} />
          ),
        }}
      />
     <Tab.Screen
      name="GoalsTab"
      component={GoalsTabScreen}
      options={{
        tabBarLabel: 'Coach',
        tabBarIcon: ({color, size}) => (
          // Sparkle's path doesn't fill its viewBox as fully as the other tab
          // glyphs (calendar/home/etc.), so it reads visibly smaller at the
          // same numeric size — bump it up to match their apparent weight,
          // then pull it back up with a negative margin to compensate for
          // the extra height so the label doesn't shift down vs. its siblings.
          <View style={{marginTop: -5}}>
            <SparkleIcon size={size * 1.4} color={color} />
          </View>
        ),
      }}
    />
      <Tab.Screen
        name="AnalysisTab"
        component={AnalysisTabScreen}
        options={{
          tabBarLabel: 'Analysis',
          tabBarIcon: ({color, size}) => (
            <CardioLoadIcon size={size} color={color} />
          ),
        }}
      />
     
     <Tab.Screen
        name="CalendarTab"
        component={CalendarTabScreen}
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({color, size}) => (
            <CalendarIcon size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileTabScreen}
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

// Set once NavigationContainer's onReady fires. A 401 hit during the very
// first cold-start profile/activities fetch (i.e. before the nav is ready)
// just means "not logged in" — silently land on Login instead of popping an
// alert the user never asked for.
let isAppReady = false;

// Deep links can be delivered twice for the same URL (Linking 'url' event +
// getInitialURL on cold start). The auth code inside is single-use on the
// server, so remember what we've already handled.
const handledDeepLinks = new Set<string>();

setSessionExpiredHandler(() => {
  if (!isAppReady) {
    // signOut() already reset the nav stack to Login — nothing else to do.
    return;
  }
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
    logger.debug('🌐 [App] Global deep link handler initialized');
    logger.debug('🌐 [App] Starting deep link setup...');
    
    const handleDeepLink = async (event: {url: string}) => {
      const url = event.url;
      if (handledDeepLinks.has(url)) {
        logger.debug('🔁 [App] Deep link already handled, skipping:', url);
        return;
      }
      handledDeepLinks.add(url);
      logger.debug('');
      logger.debug('========================================');
      logger.debug('🔗🔗🔗 [App] DEEP LINK RECEIVED!!!');
      logger.debug('🔗 [App] Deep link URL:', url);
      logger.debug('🔍 [App] Full URL (JSON):', JSON.stringify(url));
      logger.debug('========================================');
      logger.debug('');
      
      // Oura connect deep link — not an auth/token link like Strava's;
      // OuraIntegrationScreen listens for this itself (see its own
      // Linking.addEventListener) and refreshes its own connection status.
      // Bail out here so it doesn't fall into the auth-code branch below
      // and log a spurious "Code not found in URL" error.
      if (url.includes('bikelab://oura')) {
        logger.debug('✅ [App] Oura connect deep link — handled by OuraIntegrationScreen.');
        return;
      }

      // Strava LINK flow's callback (see src/auth/strava.ts + GET
      // /link_strava on the server). This never carries a token — linking
      // doesn't touch the session at all — so we just emit an event for
      // StravaIntegrationScreen to pick up and refresh its own status.
      if (url.includes('bikelab://strava-linked')) {
        logger.debug('✅ [App] Strava link result deep link detected.');
        const ok = /[?&]ok=1\b/.test(url);
        const errorMatch = url.match(/[?&]error=([^&]+)/);
        emitStravaLinked({
          ok,
          error: errorMatch ? decodeURIComponent(errorMatch[1]) : undefined,
        });
        return;
      }

      // Проверяем, это deep link для авторизации (custom scheme или Universal Link)
      if (url.includes('bikelab://') || url.includes('bikelab.app/auth')) {
        logger.debug('✅ [App] Auth deep link detected!');

        try {
          // Одноразовый auth code (см. GET /exchange_token на сервере —
          // JWT больше никогда не приходит через URL, см.
          // docs/audit/layers/01-server.md S-07). Обмениваем его на
          // настоящий JWT через POST, а не читаем токен из ссылки.
          const codeMatch = url.match(/[?&]code=([^&]+)/);
          const code = codeMatch && codeMatch[1] ? decodeURIComponent(codeMatch[1]) : null;

          if (code) {
            const {token} = await apiFetch('/api/auth/exchange', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({code}),
            });
            await TokenStorage.setToken(token, true);

            // Check onboarding status before navigating
            let target = 'Main';
            try {
              const profile = await apiFetch('/api/user-profile');
              target = profile.onboarding_completed ? 'Main' : 'Onboarding';
            } catch {
              // If profile fetch fails, go to Main (will handle later)
            }
            logger.debug(`🚀 [App] Navigating to ${target}...`);
            navigationRef.current?.reset({
              index: 0,
              routes: [{name: target}],
            });
          } else {
            logger.error('❌ [App] Auth code not found in URL');
            logger.error('❌ [App] URL was:', url);
          }
        } catch (error) {
          logger.error('❌ [App] Error processing deep link:', error);
        }
      } else {
        logger.debug('ℹ️ [App] Not an auth deep link, ignoring');
      }
    };

    // Подписываемся на deep links
    logger.debug('');
    logger.debug('📡 [App] Adding deep link listener...');
    const subscription = Linking.addEventListener('url', handleDeepLink);
    logger.debug('✅ [App] Deep link listener added successfully!');
    logger.debug('✅ [App] Listening for: bikelab:// and bikelab.app/auth');
    logger.debug('');

    // Проверяем initial URL при запуске
    logger.debug('🔍 [App] Checking for initial URL...');
    Linking.getInitialURL().then((url: string | null) => {
      logger.debug('🔍 [App] getInitialURL result:', url);
      if (url) {
        logger.debug('🔗 [App] Initial URL detected:', url);
        logger.debug('🔗 [App] Processing initial URL...');
        handleDeepLink({url});
      } else {
        logger.debug('ℹ️ [App] No initial URL (app opened normally)');
      }
    }).catch((err) => {
      logger.error('❌ [App] Error getting initial URL:', err);
    });
    
    logger.debug('✅ [App] Deep link setup complete!');

    return () => {
      logger.debug('🔌 [App] Deep link listener removed');
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
    <SafeAreaProvider>
      <AppDataProvider>
        <SplashProvider value={{hideSplash}}>
          {splashVisible && (
            <Modal visible animationType="fade" statusBarTranslucent>
              <SplashLoader />
            </Modal>
          )}
          {initialRoute !== null && (
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                isAppReady = true;
              }}>
              <ErrorBoundary>
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
              </ErrorBoundary>
            </NavigationContainer>
          )}
        </SplashProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

export default App;
