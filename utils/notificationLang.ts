import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getNotificationLang(): Promise<'tr' | 'en'> {
  try {
    const saved = await AsyncStorage.getItem('lumibaby_lang');
    return saved === 'en' ? 'en' : 'tr';
  } catch {
    return 'tr';
  }
}
