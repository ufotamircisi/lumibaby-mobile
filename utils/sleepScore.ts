// utils/sleepScore.ts — v3 (sıfırdan yeniden yazıldı)
// Tamamen unit-testable pure functions. Dışarıdan import: hesaplaSleepScore.

export type PuanDetayItem = {
  baslik: string;
  puan: number;
  pozitif: boolean | null;
  tip?: string;
};

export interface SleepScoreInput {
  toplamUyku: number;      // saniye
  baslangicTs: number;     // ms timestamp
  isGunduz: boolean;
  bebekHaftasi: number | null;
  aglamaSayisi: number;
  aglamaSuresi?: number;   // saniye (opsiyonel)
  napSayisi?: number;
  sonNapBitisTs?: number;  // ms (opsiyonel)
  lang: 'tr' | 'en';
}

export interface SleepScoreResult {
  toplam: number;          // 40–100 arası (geçersiz kayıt: 0)
  geceCeza: number;
  gunduzCeza: number;
  sureOrani: number;       // gerçek / hedef (0–∞)
  skorTavani: number | null;
  detaylar: PuanDetayItem[];
  enBuyukEtki: {
    baslik: string;
    penalty: number;
    potansiyelKazanc: number;
  } | null;
  aksiyonlar: string[];
  yorumEmoji: string;
  yorumMesaj: string;
  ozetCumle: string;
  buGeceIcin: string;
}

// ── SÜRE FORMATLAMA ───────────────────────────────────────────────────────────
// Bug fix: saat=0 ise "0s 24dk" yerine "24 dk" yaz

function _fmtH(saatKesirsiz: number, lang: 'tr' | 'en'): string {
  const s  = Math.floor(saatKesirsiz);
  const dk = Math.round((saatKesirsiz - s) * 60);
  if (lang === 'en') {
    if (s === 0) return `${dk}m`;
    return dk === 0 ? `${s}h` : `${s}h ${dk}m`;
  }
  if (s === 0) return `${dk} dk`;
  return dk === 0 ? `${s}s` : `${s}s ${dk}dk`;
}

function _fmtT(saat: number, dakika: number): string {
  return `${String(saat).padStart(2, '0')}:${String(dakika).padStart(2, '0')}`;
}

// ── YAŞ BAZLI HEDEFLER ────────────────────────────────────────────────────────

function _geceHedef(haftasi: number | null): number {
  if (haftasi === null) return 10;
  if (haftasi <= 13)   return 8.5;  // 0-3 ay: 8-9s (orta)
  return 10.5;                      // 4 ay+: 10-11s (orta)
}

function _gunduzHedef(haftasi: number | null): number {
  if (haftasi === null) return 2;
  if (haftasi <= 13)   return 7;    // 0-3 ay: 6-8s
  if (haftasi <= 26)   return 3.5;  // 4-6 ay: 3-4s
  if (haftasi <= 52)   return 2.5;  // 7-12 ay: 2-3s
  if (haftasi <= 78)   return 1.75; // 13-18 ay: 1.5-2s
  if (haftasi <= 104)  return 1.25; // 19-24 ay: 1-1.5s
  return 1;                         // 2-3 yaş: 1s
}

function _napHedefAralik(haftasi: number | null): [number, number] {
  if (haftasi === null) return [2, 3];
  if (haftasi <= 13)   return [4, 5];
  if (haftasi <= 26)   return [3, 3];
  if (haftasi <= 52)   return [2, 2];
  if (haftasi <= 78)   return [1, 2];
  if (haftasi <= 104)  return [1, 1];
  return [0, 1];
}

// ── SÜRE BAZLI TAVAN ──────────────────────────────────────────────────────────
// Tüm diğer hesaplamalardan ÖNCE okunur, SONRA uygulanır.
// %60-90+ arası → tavan yok (null döner)

function _skorTavani(oran: number): number | null {
  if (oran < 0.15) return 45;
  if (oran < 0.30) return 55;
  if (oran < 0.60) return 65;
  return null;
}

// ── YORUM KATMANI ─────────────────────────────────────────────────────────────

function _yorum(toplam: number, lang: 'tr' | 'en'): { yorumEmoji: string; yorumMesaj: string } {
  if (toplam >= 85) return {
    yorumEmoji: '🌟',
    yorumMesaj: lang === 'en'
      ? 'Balance is great — small tweaks for perfection.'
      : 'Denge iyi, küçük dokunuşlarla mükemmele yakın.',
  };
  if (toplam >= 70) return {
    yorumEmoji: '💛',
    yorumMesaj: lang === 'en'
      ? 'Generally good, but 1–2 critical points need attention.'
      : 'Genel iyi ama 1-2 kritik nokta var.',
  };
  if (toplam >= 50) return {
    yorumEmoji: '⚠️',
    yorumMesaj: lang === 'en'
      ? 'Sleep pattern is inconsistent — intervention needed.'
      : 'Uyku düzeni kararsız, müdahale gerekli.',
  };
  return {
    yorumEmoji: '🔴',
    yorumMesaj: lang === 'en'
      ? 'Serious irregularity — systematic correction required.'
      : 'Ciddi düzensizlik, sistematik düzeltme şart.',
  };
}

// ── DİNAMİK ÖZET CÜMLE ───────────────────────────────────────────────────────
// Süre + ağlama kombinasyonuna göre üretilir

function _ozetCumle(
  sureOrani: number,
  aglamaSayisi: number,
  isGunduz: boolean,
  lang: 'tr' | 'en',
): string {
  if (isGunduz) {
    if (sureOrani >= 0.9) return lang === 'en' ? 'Nap duration was excellent ✨'               : 'Şekerleme süresi mükemmeldi ✨';
    if (sureOrani >= 0.6) return lang === 'en' ? 'Decent nap, close to target 💛'             : 'Yeterli şekerleme, hedefe yakın 💛';
    return                       lang === 'en' ? 'Short nap — watch for fussiness tonight ⚠️' : 'Kısa şekerleme — akşam huzursuzluk olabilir ⚠️';
  }
  const sureIyi   = sureOrani >= 0.75;
  const aglamaIyi = aglamaSayisi <= 2;
  if  (sureIyi  && aglamaIyi)  return lang === 'en' ? 'Good sleep and calm night 🌟'             : 'İyi uyku, sakin bir gece 🌟';
  if  (sureIyi  && !aglamaIyi) return lang === 'en' ? 'Good duration but frequent waking 💛'     : 'Süre yeterli ama sık uyandı 💛';
  if  (!sureIyi && aglamaIyi)  return lang === 'en' ? 'Short sleep but no crying — improving 💚' : 'Uyku süresi düşük ama ağlama yok — iyiye gidiyorsunuz 💚';
  return                              lang === 'en' ? 'Short sleep, may wake more tonight ⚠️'    : 'Az uyudu, bu gece daha sık uyanabilir ⚠️';
}

// ── BU GECE İÇİN ─────────────────────────────────────────────────────────────
// Gündüz raporu için boş string döner

function _buGeceIcin(
  sureOrani: number,
  aglamaSayisi: number,
  isGunduz: boolean,
  lang: 'tr' | 'en',
): string {
  if (isGunduz) return '';
  if (sureOrani < 0.6) {
    return lang === 'en'
      ? 'Short sleep — baby may wake more often. Keep the detector on for a faster response.'
      : 'Az uyuduğu için bu gece daha sık uyanabilir. Dedektörü açık bırak.';
  }
  if (sureOrani >= 0.9 && aglamaSayisi <= 2) {
    return lang === 'en'
      ? 'Excellent night — restful sleep expected tonight too 🌙'
      : 'Harika bir gece geçirdi, bu gece de rahat uyuması bekleniyor 🌙';
  }
  return lang === 'en'
    ? 'Average night. Keep the evening routine consistent for improvement.'
    : 'Ortalama bir gece. İyileştirmek için akşam rutinini düzenli tut.';
}

// ── EN BÜYÜK ETKİ ─────────────────────────────────────────────────────────────
// detaylar içinde en büyük cezayı bul; potansiyelKazanc = |penalty| × 0.8

function _enBuyukEtki(
  detaylar: PuanDetayItem[],
): SleepScoreResult['enBuyukEtki'] {
  let minPuan = 0;
  let bestIdx = -1;
  for (let i = 0; i < detaylar.length; i++) {
    if (detaylar[i].puan < minPuan) { minPuan = detaylar[i].puan; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  return {
    baslik:           detaylar[bestIdx].baslik,
    penalty:          minPuan,
    potansiyelKazanc: Math.round(Math.abs(minPuan) * 0.8),
  };
}

// ── AKSİYON ÜRETİCİ ──────────────────────────────────────────────────────────
// Aktif cezalara göre somut, saat içeren öneriler — genel laf YASAK

function _aksiyonlar(
  detaylar: PuanDetayItem[],
  lang: 'tr' | 'en',
  bebekHaftasi: number | null,
): string[] {
  const aktif = detaylar.filter(d => d.puan < 0 && d.tip !== 'note');
  if (aktif.length === 0) {
    return [lang === 'en' ? '✅ Keep the routine — great work!' : '✅ Rutini koru, harika gidiyorsunuz!'];
  }
  const set = new Set<string>();
  for (const d of aktif) {
    switch (d.tip) {
      case 'sure':
        set.add(lang === 'en'
          ? "👉 Try bedtime before 21:00 tonight to reach the sleep target."
          : "👉 Bu gece 21:00'dan önce yatır.");
        break;
      case 'baslangic':
        set.add(lang === 'en'
          ? "👉 Start the bedtime routine at 20:00–20:30 (bath, dim lights, lullaby)."
          : "👉 Akşam rutinini 20:00–20:30'da başlat (banyo, ışık kısma, ninni).");
        break;
      case 'aglama':
        set.add(lang === 'en'
          ? '👉 Keep the sleep detector on tonight to respond faster to crying.'
          : '👉 Gece dedektörünü açık bırak.');
        break;
      case 'aglamaSure':
        set.add(lang === 'en'
          ? '👉 Respond quickly when baby cries — aim for under 5 minutes.'
          : '👉 Ağlayınca 5 dakika içinde müdahale et.');
        break;
      case 'napSure':
        set.add(lang === 'en'
          ? '👉 Keep naps between 30 min and 2.5h for better nights.'
          : '👉 Şekerlemeyi 30 dk ile 2,5 saat arasında tut.');
        break;
      case 'napSayi': {
        const [napMin, napMax] = _napHedefAralik(bebekHaftasi);
        const hedef = napMin === napMax ? `${napMin}` : `${napMin}–${napMax}`;
        set.add(lang === 'en'
          ? `👉 Aim for ${hedef} nap${napMax !== 1 ? 's' : ''} per day for this age.`
          : `👉 Bu yaş için günde ${hedef} şekerleme hedefle.`);
        break;
      }
      case 'sonNap':
        set.add(lang === 'en'
          ? "👉 End the last nap before 16:30."
          : "👉 Son nap'i 16:30'dan önce bitir.");
        break;
    }
  }
  return [...set].slice(0, 3);
}

// ── ANA FONKSİYON ─────────────────────────────────────────────────────────────
// Tek rapor: ağırlık 1.0.
// İkili rapor (gece + gündüz): caller geceCeza×0.70 + gündüzCeza×0.30 uygular.

export function hesaplaSleepScore(input: SleepScoreInput): SleepScoreResult {
  const {
    toplamUyku, baslangicTs, isGunduz, bebekHaftasi,
    aglamaSayisi, aglamaSuresi, napSayisi, sonNapBitisTs, lang,
  } = input;

  // Geçersiz kayıt (< 5 dakika)
  if (toplamUyku < 300) {
    const d: PuanDetayItem = {
      baslik: lang === 'en' ? 'Invalid record (< 5 min)' : 'Geçersiz kayıt (< 5 dk)',
      puan: 0, pozitif: null, tip: 'note',
    };
    return {
      toplam: 0, geceCeza: 0, gunduzCeza: 0, sureOrani: 0, skorTavani: null,
      detaylar: [d], enBuyukEtki: null, aksiyonlar: [],
      yorumEmoji: '❓', yorumMesaj: '', ozetCumle: '', buGeceIcin: '',
    };
  }

  const toplamSaat = toplamUyku / 3600;
  const hedefSaat  = isGunduz ? _gunduzHedef(bebekHaftasi) : _geceHedef(bebekHaftasi);
  const sureOrani  = toplamSaat / hedefSaat;

  // Tavan hesabı (en önce): %60'ın altında tavan var
  const tavani = _skorTavani(sureOrani);

  const detaylar: PuanDetayItem[] = [];
  let geceCeza   = 0;
  let gunduzCeza = 0;

  if (isGunduz) {
    // ──────────────────────────────── GÜNDÜZ CEZALARI ──────────────────────────

    // 1. Nap süresi
    let napDurCeza = 0;
    let napDurBaslik: string;
    if (toplamSaat < 0.5) {
      napDurCeza = 8;
      napDurBaslik = lang === 'en'
        ? `Nap too short (${_fmtH(toplamSaat, lang)}, < 30 min)`
        : `Şekerleme çok kısa (${_fmtH(toplamSaat, lang)}, < 30 dk)`;
    } else if (toplamSaat > 2.5) {
      napDurCeza = 12;
      napDurBaslik = lang === 'en'
        ? `Nap too long (${_fmtH(toplamSaat, lang)}, > 2.5h)`
        : `Şekerleme çok uzun (${_fmtH(toplamSaat, lang)}, > 2.5s)`;
    } else {
      napDurBaslik = lang === 'en'
        ? `Nap duration (${_fmtH(toplamSaat, lang)} ✓)`
        : `Şekerleme süresi (${_fmtH(toplamSaat, lang)} ✓)`;
    }
    gunduzCeza += napDurCeza;
    detaylar.push({ baslik: napDurBaslik, puan: -napDurCeza, pozitif: napDurCeza === 0 ? null : false, tip: 'napSure' });

    // 2. Nap sayısı (varsa)
    if (napSayisi !== undefined) {
      const [napMin, napMax] = _napHedefAralik(bebekHaftasi);
      const inRange   = napSayisi >= napMin && napSayisi <= napMax;
      const fark      = inRange ? 0 : Math.min(
        Math.abs(napSayisi - napMin),
        Math.abs(napSayisi - napMax),
      );
      const aralikStr = napMin === napMax ? `${napMin}` : `${napMin}–${napMax}`;
      let napSayiCeza = 0;
      let napSayiBaslik: string;
      if (fark === 0) {
        napSayiBaslik = lang === 'en'
          ? `Nap count (${napSayisi}, ideal ${aralikStr} ✓)`
          : `Şekerleme sayısı (${napSayisi}, ideal ${aralikStr} ✓)`;
      } else if (fark === 1) {
        napSayiCeza = 5;
        napSayiBaslik = lang === 'en'
          ? `Nap count (${napSayisi}, ±1 from ideal ${aralikStr})`
          : `Şekerleme sayısı (${napSayisi}, idealden ±1)`;
      } else {
        napSayiCeza = 10;
        napSayiBaslik = lang === 'en'
          ? `Nap count (${napSayisi}, ±2+ from ideal ${aralikStr})`
          : `Şekerleme sayısı (${napSayisi}, idealden ±2+)`;
      }
      gunduzCeza += napSayiCeza;
      detaylar.push({ baslik: napSayiBaslik, puan: -napSayiCeza, pozitif: napSayiCeza === 0 ? null : false, tip: 'napSayi' });
    }

    // 3. Son nap bitiş saati (varsa)
    if (sonNapBitisTs !== undefined) {
      const bitisDate = new Date(sonNapBitisTs);
      const bitisDk   = bitisDate.getHours() * 60 + bitisDate.getMinutes();
      const timeStr   = _fmtT(bitisDate.getHours(), bitisDate.getMinutes());
      let sonNapCeza = 0;
      let sonNapBaslik: string;
      if (bitisDk < 16 * 60 + 30) {
        sonNapBaslik = lang === 'en'
          ? `Last nap end (${timeStr}, ideal ✓)`
          : `Son şekerleme bitiş (${timeStr}, ideal ✓)`;
      } else if (bitisDk < 17 * 60 + 30) {
        sonNapCeza = 5;
        sonNapBaslik = lang === 'en'
          ? `Last nap end (${timeStr}, slightly late)`
          : `Son şekerleme bitiş (${timeStr}, biraz geç)`;
      } else {
        sonNapCeza = 10;
        sonNapBaslik = lang === 'en'
          ? `Last nap end (${timeStr}, too late)`
          : `Son şekerleme bitiş (${timeStr}, çok geç)`;
      }
      gunduzCeza += sonNapCeza;
      detaylar.push({ baslik: sonNapBaslik, puan: -sonNapCeza, pozitif: sonNapCeza === 0 ? null : false, tip: 'sonNap' });
    }

  } else {
    // ──────────────────────────────── GECE CEZALARI ────────────────────────────

    const yuzde = sureOrani * 100;

    // 1. Süre cezası
    let sureCeza: number;
    let sureBaslik: string;
    const sureFmt = `${_fmtH(toplamSaat, lang)} / ${_fmtH(hedefSaat, lang)}`;
    if (yuzde >= 90) {
      sureCeza = 0;
      sureBaslik = lang === 'en'
        ? `Duration (${sureFmt}, ≥90% ✓)`
        : `Süre (${sureFmt}, ≥%90 ✓)`;
    } else if (yuzde >= 75) {
      sureCeza = 15;
      sureBaslik = lang === 'en'
        ? `Duration (${sureFmt}, 75–89%)`
        : `Süre (${sureFmt}, %75–89)`;
    } else if (yuzde >= 60) {
      sureCeza = 25;
      sureBaslik = lang === 'en'
        ? `Duration (${sureFmt}, 60–74%)`
        : `Süre (${sureFmt}, %60–74)`;
    } else {
      sureCeza = 35;
      sureBaslik = lang === 'en'
        ? `Duration (${sureFmt}, < 60%)`
        : `Süre (${sureFmt}, <%60)`;
    }

    // 2. Yatma saati cezası
    const bDate    = new Date(baslangicTs);
    const bSaat    = bDate.getHours();
    const bDak     = bDate.getMinutes();
    const startMin = bSaat * 60 + bDak;
    // 00:00–04:59 → gece yarısından sonra → +1440 dk ile normalize et
    const normStart  = startMin < 5 * 60 ? startMin + 1440 : startMin;
    const startStr   = _fmtT(bSaat, bDak);
    let yatmaCeza: number;
    let yatmaBaslik: string;
    if (normStart < 21 * 60) {
      yatmaCeza = 0;
      yatmaBaslik = lang === 'en'
        ? `Bedtime (${startStr}, ideal ✓)`
        : `Uyku saati (${startStr}, ideal ✓)`;
    } else if (normStart < 22 * 60) {
      yatmaCeza = 5;
      yatmaBaslik = lang === 'en'
        ? `Bedtime (${startStr}, slightly late)`
        : `Uyku saati (${startStr}, biraz geç)`;
    } else {
      yatmaCeza = 10;
      yatmaBaslik = lang === 'en'
        ? `Bedtime (${startStr}, late)`
        : `Uyku saati (${startStr}, geç)`;
    }

    // Çifte ceza önleme: SADECE %60–89 bandında çalışır (<%60 durumunda UYGULANMAZ)
    if (yatmaCeza > 0 && yuzde >= 60 && yuzde < 90 && sureCeza > 0) {
      sureCeza = Math.round(sureCeza * 0.5);
      sureBaslik += lang === 'en' ? ' (halved — late bedtime)' : ' (yarıya indirildi — geç yatış)';
    }

    geceCeza += sureCeza;
    geceCeza += yatmaCeza;
    detaylar.push({ baslik: sureBaslik,  puan: -sureCeza,  pozitif: sureCeza === 0  ? null : false, tip: 'sure'      });
    detaylar.push({ baslik: yatmaBaslik, puan: -yatmaCeza, pozitif: yatmaCeza === 0 ? null : false, tip: 'baslangic' });

    // 3. Ağlama sayısı
    let aglamaSayiCeza: number;
    let aglamaSayiBaslik: string;
    if (aglamaSayisi <= 2) {
      aglamaSayiCeza = 0;
      aglamaSayiBaslik = lang === 'en'
        ? `Crying (${aglamaSayisi}×, calm ✓)`
        : `Ağlama (${aglamaSayisi} kez, sakin ✓)`;
    } else if (aglamaSayisi <= 5) {
      aglamaSayiCeza = 8;
      aglamaSayiBaslik = lang === 'en'
        ? `Crying (${aglamaSayisi}×, moderate)`
        : `Ağlama (${aglamaSayisi} kez, orta)`;
    } else {
      aglamaSayiCeza = 15;
      aglamaSayiBaslik = lang === 'en'
        ? `Crying (${aglamaSayisi}×, frequent)`
        : `Ağlama (${aglamaSayisi} kez, sık)`;
    }
    geceCeza += aglamaSayiCeza;
    detaylar.push({ baslik: aglamaSayiBaslik, puan: -aglamaSayiCeza, pozitif: aglamaSayiCeza === 0 ? null : false, tip: 'aglama' });

    // 4. Ağlama süresi (opsiyonel)
    if (aglamaSuresi !== undefined) {
      const aglamaDk    = aglamaSuresi / 60;
      const aglamaDkStr = Math.round(aglamaDk);
      let aglamaSureCeza: number;
      let aglamaSureBaslik: string;
      if (aglamaDk < 10) {
        aglamaSureCeza = 0;
        aglamaSureBaslik = lang === 'en'
          ? `Crying duration (${aglamaDkStr} min, < 10 min ✓)`
          : `Ağlama süresi (${aglamaDkStr} dk, < 10 dk ✓)`;
      } else if (aglamaDk < 20) {
        aglamaSureCeza = 5;
        aglamaSureBaslik = lang === 'en'
          ? `Crying duration (${aglamaDkStr} min, 10–20 min)`
          : `Ağlama süresi (${aglamaDkStr} dk, 10–20 dk)`;
      } else {
        aglamaSureCeza = 12;
        aglamaSureBaslik = lang === 'en'
          ? `Crying duration (${aglamaDkStr} min, 20+ min)`
          : `Ağlama süresi (${aglamaDkStr} dk, 20+ dk)`;
      }
      geceCeza += aglamaSureCeza;
      detaylar.push({ baslik: aglamaSureBaslik, puan: -aglamaSureCeza, pozitif: aglamaSureCeza === 0 ? null : false, tip: 'aglamaSure' });
    }
  }

  // ── FİNAL SKOR ────────────────────────────────────────────────────────────────
  // 1. Ham ceza (tek rapor ağırlığı: 1.0)
  const hamCeza = isGunduz ? gunduzCeza : geceCeza;

  // 2. Maksimum -60 ceza → minimum skor 40
  let toplam = Math.max(40, Math.round(100 - Math.min(hamCeza, 60)));

  // 3. Süre tavanı son aşamada uygulanır — final skoru geçemez
  if (tavani !== null) toplam = Math.min(toplam, tavani);

  const enBuyukEtki = _enBuyukEtki(detaylar);
  const aksiyonlar  = _aksiyonlar(detaylar, lang, bebekHaftasi);
  const { yorumEmoji, yorumMesaj } = _yorum(toplam, lang);
  const ozetCumle   = _ozetCumle(sureOrani, aglamaSayisi, isGunduz, lang);
  const buGeceIcin  = _buGeceIcin(sureOrani, aglamaSayisi, isGunduz, lang);

  return {
    toplam, geceCeza, gunduzCeza, sureOrani, skorTavani: tavani,
    detaylar, enBuyukEtki, aksiyonlar,
    yorumEmoji, yorumMesaj, ozetCumle, buGeceIcin,
  };
}

// ── KOMBİNE SKOR (gece + gündüz aynı günde) ──────────────────────────────────
// geceCeza × 0.70 + gündüzCeza × 0.30; tavan her ikisinin minimu olarak uygulanır

export function hesaplaKombineSkor(
  gece: SleepScoreResult,
  gunduz: SleepScoreResult,
): number {
  const hamCeza  = gece.geceCeza * 0.70 + gunduz.gunduzCeza * 0.30;
  let toplam     = Math.max(40, Math.round(100 - Math.min(hamCeza, 60)));
  const tavani   = [gece.skorTavani, gunduz.skorTavani].filter((t): t is number => t !== null);
  if (tavani.length > 0) toplam = Math.min(toplam, Math.min(...tavani));
  return toplam;
}
