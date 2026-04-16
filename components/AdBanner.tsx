// components/AdBanner.tsx
// Native modül — EAS Build'de çalışır, Expo Go'da null döner
import { getBannerAdUnitId } from '@/services/adMob';
import React from 'react';
import { NativeModules, View } from 'react-native';

// Expo Go tespiti — adMob.ts ile aynı mantık
const IS_AVAILABLE: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    if (Constants?.executionEnvironment === 'storeClient') return false;
    return !!NativeModules.RNGoogleMobileAdsModule;
  } catch {
    return false;
  }
})();

export default function AdBanner() {
  if (!IS_AVAILABLE) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads');
    return (
      <View style={{ alignItems: 'center', width: '100%' }}>
        <BannerAd
          unitId={getBannerAdUnitId()}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        />
      </View>
    );
  } catch {
    return null;
  }
}
