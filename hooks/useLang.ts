// hooks/useLang.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Lang, translations } from '../constants/translations';

const LANG_KEY = 'lumibaby_lang';

let _lang: Lang = 'tr';
let _listeners: Array<(l: Lang) => void> = [];

export function useLang() {
  const [lang, setLangState] = useState<Lang>(_lang);

  useEffect(() => {
    // İlk yüklemede AsyncStorage'dan oku
    AsyncStorage.getItem(LANG_KEY).then(v => {
      if (v === 'tr' || v === 'en') {
        _lang = v;
        setLangState(v);
        _listeners.forEach(fn => fn(v));
      }
    });

    // Global listener ekle
    const listener = (l: Lang) => setLangState(l);
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(fn => fn !== listener); };
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    _lang = l;
    await AsyncStorage.setItem(LANG_KEY, l);
    _listeners.forEach(fn => fn(l));
  }, []);

  const t = translations[lang];

  return { lang, setLang, t };
}
