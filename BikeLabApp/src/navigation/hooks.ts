// Typed replacements for `useNavigation<any>()` / `navigation: any` props
// and `useRoute()` / `route: any` props (audit A-08, T-5.2).
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {AllScreensParamList, AppNavigationProp} from './types';

export function useAppNavigation(): AppNavigationProp {
  return useNavigation<AppNavigationProp>();
}

export function useAppRoute<RouteName extends keyof AllScreensParamList>(): RouteProp<
  AllScreensParamList,
  RouteName
> {
  return useRoute<RouteProp<AllScreensParamList, RouteName>>();
}
