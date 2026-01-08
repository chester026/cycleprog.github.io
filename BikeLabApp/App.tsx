import React, {useState, useEffect, createRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {StyleSheet, Image, View, Linking, Alert} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {apiFetch, TokenStorage} from './src/utils/api';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const GoalsStack = createNativeStackNavigator();
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
            blurType="dark"
            blurAmount={15}
            style={StyleSheet.absoluteFill}
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
        component={GarageScreen}
        options={{
          tabBarLabel: 'Garage',
          tabBarIcon: ({color, size}) => (
            <HomeIcon size={size} color={color} />
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

function App(): React.JSX.Element {
  // Глобальный обработчик deep links для Strava OAuth
  useEffect(() => {
    console.log('🌐 Global deep link handler initialized');
    
    const handleDeepLink = async (event: {url: string}) => {
      const url = event.url;
      console.log('🔗 [App] Deep link received:', url);
      
      // Проверяем, это deep link для авторизации
      if (url.startsWith('bikelab://auth')) {
        console.log('✅ [App] Auth deep link detected!');
        
        try {
          const tokenMatch = url.match(/token=([^&]+)/);
          if (tokenMatch && tokenMatch[1]) {
            const token = decodeURIComponent(tokenMatch[1]);
            console.log('✅ [App] Token extracted, length:', token.length);
            
            await TokenStorage.setToken(token, true);
            console.log('✅ [App] Token saved, navigating to Main...');
            
            // Используем navigationRef для навигации
            navigationRef.current?.reset({
              index: 0,
              routes: [{name: 'Main'}],
            });
          } else {
            console.error('❌ [App] Token not found in URL');
            Alert.alert('Error', 'Failed to extract token from URL');
          }
        } catch (error) {
          console.error('❌ [App] Error processing deep link:', error);
          Alert.alert('Error', 'Failed to process authorization');
        }
      }
    };

    // Подписываемся на deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Проверяем initial URL при запуске
    Linking.getInitialURL().then((url: string | null) => {
      if (url) {
        console.log('🔗 [App] Initial URL detected:', url);
        handleDeepLink({url});
      } else {
        console.log('ℹ️ [App] No initial URL');
      }
    });

    return () => {
      console.log('🔌 [App] Deep link listener removed');
      subscription.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: '#0a0a0a'},
        }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
