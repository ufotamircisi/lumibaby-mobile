import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

export const SCREEN_WIDTH  = width;
export const SCREEN_HEIGHT = height;
export const isTablet      = width >= 768;
export const isIPad        = Platform.OS === 'ios' && isTablet;

const BASE_WIDTH  = 390;
const BASE_HEIGHT = 844;

export const s = (size: number) =>
  Math.round((width / BASE_WIDTH) * size);

export const vs = (size: number) =>
  Math.round((height / BASE_HEIGHT) * size);

export const ms = (size: number, factor = 0.5) =>
  Math.round(size + (s(size) - size) * factor);

export const CARD_PADDING = s(16);
export const CARD_RADIUS  = s(16);
export const CARD_MARGIN  = s(12);
export const CARD_WIDTH   = isTablet
  ? (width - s(48)) / 2
  : width - s(32);
