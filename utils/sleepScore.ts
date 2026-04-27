export type PuanDetayItem = {
  baslik: string;
  puan: number;
  pozitif: boolean | null;
  tip?: string;
};

export interface SleepScoreInput {
  toplamUyku: number;       // saniye
  baslangicTs: number;      // timestamp ms
  isGunduz: boolean;
  bebekHaftasi: number | null;
  aglamaSayisi: number;
  aglamaSuresi?: number;    // saniye (opsiyonel)
  napSayisi?: number;       // gün içi şekerleme sayısı (opsiyonel)
  sonNapBitisTs?: number;   // son şekerleme bitiş timestamp ms (opsiyonel)
  lang: 'tr' | 'en';
}

export interface SleepScoreResult {
  toplam: number;           // 40–100 (geçersiz kayıt: 0)
  geceCeza: number;
  gunduzCeza: number;
  detaylar: PuanDetayItem[];
  enBuyukEtki: { baslik: string; potansiyelKazanc: number } | null;
  aksiyonlar: string[];
  yorumEmoji: string;
  yorumMesaj: string;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function _fmtH(saat: number, lang: 'tr' | 'en'): string {
  const s = Math.floor(saat);
  const dk = Math.round((saat - s) * 60);
  if (lang === 'en') return dk === 0 ? `${s}h` : `${s}h ${dk}m`;
  return dk === 0 ? `${s}s` : `${s}s ${dk}dk`;
}

function _fmtT(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function _geceHedef(haftasi: number | null): number {
  if (haftasi === null) return 10;
  if (haftasi <= 12)   return 8;
  if (haftasi <= 26)   return 9;
  return 10;
}

function _napHedefAralik(haftasi: number | null): [number, number] {
  if (haftasi === null) return [2, 3];
  if (haftasi <= 12)   return [4, 5];
  if (haftasi <= 26)   return [3, 3];
  if (haftasi <= 52)   return [2, 2];
  if (haftasi <= 78)   return [1, 2];
  if (haftasi <= 104)  return [1, 1];
  if (haftasi <= 156)  return [0, 1];
  return [0, 0];
}

function _yorumHesapla(toplam: number, lang: 'tr' | 'en'): { yorumEmoji: string; yorumMesaj: string } {
  if (toplam >= 85) return { yorumEmoji: '🌟', yorumMesaj: lang === 'en' ? 'Excellent sleep!' : 'Harika bir uyku!' };
  if (toplam >= 70) return { yorumEmoji: '😊', yorumMesaj: lang === 'en' ? 'Good sleep.' : 'İyi bir uyku.' };
  if (toplam >= 55) return { yorumEmoji: '😐', yorumMesaj: lang === 'en' ? 'Sleep could be better.' : 'Uyku biraz daha iyi olabilirdi.' };
  return { yorumEmoji: '😓', yorumMesaj: lang === 'en' ? 'Sleep needs improvement.' : 'Uyku iyileştirme gerektiriyor.' };
}

function _enBuyukEtkiHesapla(detaylar: PuanDetayItem[]): { baslik: string; potansiyelKazanc: number } | null {
  let minPuan = 0;
  let bestIdx = -1;
  detaylar.forEach((d, i) => { if (d.puan < minPuan) { minPuan = d.puan; bestIdx = i; } });
  if (bestIdx < 0) return null;
  return { baslik: detaylar[bestIdx].baslik, potansiyelKazanc: Math.round(Math.abs(minPuan) * 0.8) };
}

function _aksiyonlarUret(detaylar: PuanDetayItem[], input: SleepScoreInput): string[] {
  const { lang, bebekHaftasi } = input;
  const aksiyonlar: string[] = [];
  for (const d of detaylar) {
    if (d.puan >= 0) continue;
    switch (d.tip) {
      case 'sure':
        aksiyonlar.push(lang === 'en'
          ? `Target night sleep: ${_geceHedef(bebekHaftasi)}h. Try an earlier bedtime to reach the target.`
          : `Hedef gece uykusu: ${_geceHedef(bebekHaftasi)} saat. Hedefi karşılamak için daha erken yatırmayı deneyin.`);
        break;
      case 'baslangic':
        aksiyonlar.push(lang === 'en'
          ? 'Aim for bedtime before 21:00. Start the evening routine (bath, lullaby) around 20:00–20:30.'
          : 'Saat 21:00\'den önce yatırmayı hedefleyin. Akşam rutinini (banyo, ninni) 20:00–20:30 arasında başlatın.');
        break;
      case 'aglama':
        aksiyonlar.push(lang === 'en'
          ? 'Frequent crying breaks sleep. Check the sleep environment (temperature, noise, light) and use calming sounds.'
          : 'Sık ağlama uykuyu bölüyor. Uyku ortamını (ısı, ses, ışık) kontrol edin ve beyaz gürültü/ninni kullanın.');
        break;
      case 'aglamaSure':
        aksiyonlar.push(lang === 'en'
          ? 'Long crying periods indicate discomfort. Respond early to prevent overtiredness.'
          : 'Uzun ağlama süreleri rahatsızlığa işaret ediyor. Aşırı yorgunluğu önlemek için erken müdahale edin.');
        break;
      case 'napSure':
        aksiyonlar.push(lang === 'en'
          ? 'Keep nap duration between 30 min and 2.5h for optimal night sleep.'
          : 'Gece uykusunu optimize etmek için şekerleme süresini 30 dk ile 2.5 saat arasında tutun.');
        break;
      case 'napSayi': {
        const [napMin, napMax] = _napHedefAralik(bebekHaftasi);
        aksiyonlar.push(lang === 'en'
          ? `Ideal nap count for this age: ${napMin === napMax ? napMin : `${napMin}–${napMax}`} per day.`
          : `Bu yaş için ideal şekerleme sayısı: günde ${napMin === napMax ? napMin : `${napMin}–${napMax}`}.`);
        break;
      }
      case 'sonNap':
        aksiyonlar.push(lang === 'en'
          ? 'End the last nap before 16:30 so baby is ready for night sleep.'
          : 'Son şekerlemeyi 16:30\'dan önce bitirin, böylece bebek gece uykusuna hazır olsun.');
        break;
    }
  }
  return [...new Set(aksiyonlar)];
}

// ── ANA HESAPLAMA ─────────────────────────────────────────────────────────────
// Final = 100 - min(geceCeza × 0.70 + gündüzCeza × 0.30, 60), min=40
// Geçersiz kayıt (< 5 dk): toplam = 0

export function hesaplaSleepScore(input: SleepScoreInput): SleepScoreResult {
  const {
    toplamUyku, baslangicTs, isGunduz, bebekHaftasi,
    aglamaSayisi, aglamaSuresi, napSayisi, sonNapBitisTs, lang,
  } = input;
  const detaylar: PuanDetayItem[] = [];

  if (toplamUyku < 300) {
    detaylar.push({ baslik: lang === 'en' ? 'Invalid record (< 5 min)' : 'Geçersiz kayıt (< 5 dk)', puan: 0, pozitif: null, tip: 'note' });
    return { toplam: 0, geceCeza: 0, gunduzCeza: 0, detaylar, enBuyukEtki: null, aksiyonlar: [], yorumEmoji: '❓', yorumMesaj: '' };
  }

  let geceCeza = 0;
  let gunduzCeza = 0;

  if (isGunduz) {
    // ── GÜNDÜZ CEZALARI ───────────────────────────────────────────────────────

    // 1. Şekerleme süresi
    const saat = toplamUyku / 3600;
    let napDurPenalty = 0;
    let napDurBaslik: string;
    if (saat < 0.5) {
      napDurPenalty = 8;
      napDurBaslik = lang === 'en'
        ? `Nap too short (${_fmtH(saat, lang)}, < 30 min)`
        : `Şekerleme çok kısa (${_fmtH(saat, lang)}, < 30 dk)`;
    } else if (saat > 2.5) {
      napDurPenalty = 12;
      napDurBaslik = lang === 'en'
        ? `Nap too long (${_fmtH(saat, lang)}, > 2.5h)`
        : `Şekerleme çok uzun (${_fmtH(saat, lang)}, > 2.5s)`;
    } else {
      napDurBaslik = lang === 'en'
        ? `Nap duration (${_fmtH(saat, lang)} ✓)`
        : `Şekerleme süresi (${_fmtH(saat, lang)} ✓)`;
    }
    gunduzCeza += napDurPenalty;
    detaylar.push({ baslik: napDurBaslik, puan: -napDurPenalty, pozitif: napDurPenalty === 0 ? null : false, tip: 'napSure' });

    // 2. Şekerleme sayısı (opsiyonel)
    if (napSayisi !== undefined) {
      const [napMin, napMax] = _napHedefAralik(bebekHaftasi);
      const inRange = napSayisi >= napMin && napSayisi <= napMax;
      const diffFromRange = inRange ? 0 : Math.min(Math.abs(napSayisi - napMin), Math.abs(napSayisi - napMax));
      let napCntPenalty = 0;
      const rangeStr = napMin === napMax ? `${napMin}` : `${napMin}–${napMax}`;
      let napCntBaslik: string;
      if (diffFromRange === 0) {
        napCntBaslik = lang === 'en' ? `Nap count (${napSayisi}, ideal ${rangeStr})` : `Şekerleme sayısı (${napSayisi}, ideal ${rangeStr})`;
      } else if (diffFromRange === 1) {
        napCntPenalty = 5;
        napCntBaslik = lang === 'en' ? `Nap count (${napSayisi}, ±1 from ideal ${rangeStr})` : `Şekerleme sayısı (${napSayisi}, idealden ±1)`;
      } else {
        napCntPenalty = 10;
        napCntBaslik = lang === 'en' ? `Nap count (${napSayisi}, ±2+ from ideal ${rangeStr})` : `Şekerleme sayısı (${napSayisi}, idealden ±2+)`;
      }
      gunduzCeza += napCntPenalty;
      detaylar.push({ baslik: napCntBaslik, puan: -napCntPenalty, pozitif: napCntPenalty === 0 ? null : false, tip: 'napSayi' });
    }

    // 3. Son şekerleme bitiş saati (opsiyonel)
    if (sonNapBitisTs !== undefined) {
      const endH = new Date(sonNapBitisTs).getHours();
      const endM = new Date(sonNapBitisTs).getMinutes();
      const endMin = endH * 60 + endM;
      let lastNapPenalty = 0;
      let lastNapBaslik: string;
      if (endMin < 16 * 60 + 30) {
        lastNapBaslik = lang === 'en' ? `Last nap end (${_fmtT(endH, endM)}, ideal)` : `Son şekerleme bitiş (${_fmtT(endH, endM)}, ideal)`;
      } else if (endMin < 17 * 60 + 30) {
        lastNapPenalty = 5;
        lastNapBaslik = lang === 'en' ? `Last nap end (${_fmtT(endH, endM)}, slightly late)` : `Son şekerleme bitiş (${_fmtT(endH, endM)}, biraz geç)`;
      } else {
        lastNapPenalty = 10;
        lastNapBaslik = lang === 'en' ? `Last nap end (${_fmtT(endH, endM)}, too late)` : `Son şekerleme bitiş (${_fmtT(endH, endM)}, çok geç)`;
      }
      gunduzCeza += lastNapPenalty;
      detaylar.push({ baslik: lastNapBaslik, puan: -lastNapPenalty, pozitif: lastNapPenalty === 0 ? null : false, tip: 'sonNap' });
    }

  } else {
    // ── GECE CEZALARI ─────────────────────────────────────────────────────────

    // 1. Süre (hedefin yüzdesi)
    const toplamSaat = toplamUyku / 3600;
    const hedefSaat  = _geceHedef(bebekHaftasi);
    const yuzdesi    = (toplamSaat / hedefSaat) * 100;
    let durPenalty = 0;
    let durBaslik: string;
    if (yuzdesi >= 90) {
      durBaslik = lang === 'en'
        ? `Duration (${_fmtH(toplamSaat, lang)}, ≥90% of ${hedefSaat}h target ✓)`
        : `Süre (${_fmtH(toplamSaat, lang)}, ${hedefSaat}s hedefin ≥%90'ı ✓)`;
    } else if (yuzdesi >= 75) {
      durPenalty = 15;
      durBaslik = lang === 'en'
        ? `Duration (${_fmtH(toplamSaat, lang)}, 75–89% of ${hedefSaat}h target)`
        : `Süre (${_fmtH(toplamSaat, lang)}, ${hedefSaat}s hedefin %75–89'u)`;
    } else if (yuzdesi >= 60) {
      durPenalty = 25;
      durBaslik = lang === 'en'
        ? `Duration (${_fmtH(toplamSaat, lang)}, 60–74% of ${hedefSaat}h target)`
        : `Süre (${_fmtH(toplamSaat, lang)}, ${hedefSaat}s hedefin %60–74'ü)`;
    } else {
      durPenalty = 35;
      durBaslik = lang === 'en'
        ? `Duration (${_fmtH(toplamSaat, lang)}, < 60% of ${hedefSaat}h target)`
        : `Süre (${_fmtH(toplamSaat, lang)}, ${hedefSaat}s hedefin <%60'ı)`;
    }

    // 2. Uyku başlangıç saati
    const bSaat    = new Date(baslangicTs).getHours();
    const bDakika  = new Date(baslangicTs).getMinutes();
    const startMin = bSaat * 60 + bDakika;
    // gece yarısından sonrasını normalize et (00:00–02:59 → 24:00–26:59)
    const normStart = startMin < 300 ? startMin + 1440 : startMin;
    let bedtimePenalty = 0;
    let bedtimeBaslik: string;
    if (normStart < 21 * 60) {
      bedtimeBaslik = lang === 'en' ? `Bedtime (${_fmtT(bSaat, bDakika)}, ideal)` : `Uyku saati (${_fmtT(bSaat, bDakika)}, ideal)`;
    } else if (normStart < 22 * 60) {
      bedtimePenalty = 5;
      bedtimeBaslik = lang === 'en' ? `Bedtime (${_fmtT(bSaat, bDakika)}, slightly late)` : `Uyku saati (${_fmtT(bSaat, bDakika)}, biraz geç)`;
    } else {
      bedtimePenalty = 10;
      bedtimeBaslik = lang === 'en' ? `Bedtime (${_fmtT(bSaat, bDakika)}, late)` : `Uyku saati (${_fmtT(bSaat, bDakika)}, geç)`;
    }

    // Çift ceza kontrolü: hem uyku saati hem süre cezalandırılıyorsa süre ×0.50
    if (bedtimePenalty > 0 && durPenalty > 0) {
      durPenalty = Math.round(durPenalty * 0.5);
      durBaslik += lang === 'en' ? ' (halved: late bedtime)' : ' (yarıya indirildi: geç yatış)';
    }

    geceCeza += durPenalty;
    geceCeza += bedtimePenalty;
    detaylar.push({ baslik: durBaslik, puan: -durPenalty, pozitif: durPenalty === 0 ? null : false, tip: 'sure' });
    detaylar.push({ baslik: bedtimeBaslik, puan: -bedtimePenalty, pozitif: bedtimePenalty === 0 ? null : false, tip: 'baslangic' });

    // 3. Ağlama sayısı
    let cryCntPenalty = 0;
    let cryCntBaslik: string;
    if (aglamaSayisi <= 2) {
      cryCntBaslik = lang === 'en' ? `Crying (${aglamaSayisi}×, good)` : `Ağlama (${aglamaSayisi} kez, iyi)`;
    } else if (aglamaSayisi <= 5) {
      cryCntPenalty = 8;
      cryCntBaslik = lang === 'en' ? `Crying (${aglamaSayisi}×)` : `Ağlama (${aglamaSayisi} kez)`;
    } else {
      cryCntPenalty = 15;
      cryCntBaslik = lang === 'en' ? `Crying (${aglamaSayisi}×, frequent)` : `Ağlama (${aglamaSayisi} kez, sık)`;
    }
    geceCeza += cryCntPenalty;
    detaylar.push({ baslik: cryCntBaslik, puan: -cryCntPenalty, pozitif: cryCntPenalty === 0 ? null : false, tip: 'aglama' });

    // 4. Ağlama süresi (opsiyonel)
    if (aglamaSuresi !== undefined) {
      const aglamaDk = aglamaSuresi / 60;
      let cryDurPenalty = 0;
      let cryDurBaslik: string;
      if (aglamaDk < 10) {
        cryDurBaslik = lang === 'en' ? `Crying duration (${Math.round(aglamaDk)} min, < 10 min ✓)` : `Ağlama süresi (${Math.round(aglamaDk)} dk, < 10 dk ✓)`;
      } else if (aglamaDk < 20) {
        cryDurPenalty = 5;
        cryDurBaslik = lang === 'en' ? `Crying duration (${Math.round(aglamaDk)} min, 10–20 min)` : `Ağlama süresi (${Math.round(aglamaDk)} dk, 10–20 dk)`;
      } else {
        cryDurPenalty = 12;
        cryDurBaslik = lang === 'en' ? `Crying duration (${Math.round(aglamaDk)} min, 20+ min)` : `Ağlama süresi (${Math.round(aglamaDk)} dk, 20+ dk)`;
      }
      geceCeza += cryDurPenalty;
      detaylar.push({ baslik: cryDurBaslik, puan: -cryDurPenalty, pozitif: cryDurPenalty === 0 ? null : false, tip: 'aglamaSure' });
    }
  }

  const penaltyTotal = geceCeza * 0.70 + gunduzCeza * 0.30;
  const toplam = Math.max(40, Math.round(100 - Math.min(penaltyTotal, 60)));

  const enBuyukEtki  = _enBuyukEtkiHesapla(detaylar);
  const aksiyonlar   = _aksiyonlarUret(detaylar, input);
  const { yorumEmoji, yorumMesaj } = _yorumHesapla(toplam, lang);

  return { toplam, geceCeza, gunduzCeza, detaylar, enBuyukEtki, aksiyonlar, yorumEmoji, yorumMesaj };
}
