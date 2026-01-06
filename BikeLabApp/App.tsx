import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text} from 'react-native';
import {LoginScreen} from './src/screens/LoginScreen';
import {ActivitiesScreen} from './src/screens/ActivitiesScreen';
import {AnalysisScreen} from './src/screens/AnalysisScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopWidth: 1,
          borderTopColor: '#2a2a2a',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#274dd3',
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tab.Screen
        name="ActivitiesTab"
        component={ActivitiesScreen}
        options={{
          tabBarLabel: 'Activities',
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20, color}}>🚴‍♂️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="AnalysisTab"
        component={AnalysisScreen}
        options={{
          tabBarLabel: 'Analysis',
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20, color}}>📊</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function App(): React.JSX.Element {
  return (
    <NavigationContainer>
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
