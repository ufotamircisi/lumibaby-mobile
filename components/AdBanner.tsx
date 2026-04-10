// components/AdBanner.tsx
// Native modül — EAS Build'de çalışır, Expo Go'da null döner
import { getBannerAdUnitId } from '@/services/adMob';
import React from 'react';
import { View } from 'react-native';

export default function AdBanner() {
  try {
    const { BannerAd, BannerAdSize } =
      require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
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
