/**
 * @format
 */

// Must be imported before anything that uses the `uuid` package (AI Coach
// chat) — Hermes has no built-in crypto.getRandomValues, and uuid's v4()
// throws without this polyfill in place first.
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
