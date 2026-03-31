import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SesTip = { id: number; name: string; icon: string; file: any; };
type UykuKaydi = { id: number; baslangic: number; bitis: number | null; };
type GeceRaporu = {
  id: number;
  tarih: string;
  toplamUyku: number;
  aglamaSayisi: number;
  baslangic: number;
  bitis: number;
  uykulaDalma: number;
  enUzunUyku: number;
  uykuKalitesi: number;
  puanDetay: { baslik: string; puan: number; pozitif: boolean }[];
};

const AGLAMA_ESIGI_DB = -30;
const BAR_MAX_HEIGHT = 80;
type DedektorTip = 'aglama' | 'kolik';

const gunIsimleri = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const ayIsimleri = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const uzmanOnerileri = [
  '0-3 aylık bebeklerde uyku düzeni henüz oluşmamıştır. Gün içinde sık sık uyuyup uyanması tamamen normaldir. Gece ve gündüz farkını öğrenmesi zaman alır. Bebeğinizi yorgunluk belirtileri gösterdiğinde uyutmak ve çok fazla uyanmasını problem olarak görmemek önemlidir. Nazik bir ninni veya beyaz gürültü, uykuya geçişi kolaylaştırabilir.',
  '3-6 aylık bebeklerde yavaş yavaş gece ve gündüz farkı öğrenilmeye başlanır. Daha uzun uyku süreleri görülebilir. Düzenli bir uyku rutini oluşturmak (banyo, hikaye, ninni gibi) uyku kalitesini artırır. Her gün aynı saatlerde yatırmak, bebeğinizin daha kolay uykuya dalmasına yardımcı olur.',
  '6-12 aylık bebeklerin çoğu gece uykusunu daha uzun ve kesintisiz sürdürebilir. Uyku rutini artık çok daha önemlidir. Gündüz uykularının dengeli olması gece uykusunu doğrudan etkiler. Fazla gündüz uykusu gece uyanmalarına neden olabilir. Bebeğinizin kendi kendine uykuya dalmayı öğrenmesi bu dönemde desteklenmelidir.',
  '1 yaş üstü çocuklar genellikle düzenli bir uyku alışkanlığı kazanır. Uykuya direnme ve ayrılık kaygısı görülebilir. Her gün aynı uyku rutinini uygulamak ve tutarlı olmak çok önemlidir. Hikaye ve sakinleştirici bir ortam uykuya geçişi kolaylaştırır. Çocuğunuzun kendi kendine uykuya dalmasını desteklemek uzun vadede daha sağlıklı bir uyku düzeni oluşturur.',
];

const sabitNinniListesi: SesTip[] = [
  { id: 1, name: 'Dandini Dandini', icon: '⭐', file: require('../../assets/sounds/dandini.mp3') },
  { id: 2, name: 'Laylim Lay', icon: '🌙', file: require('../../assets/sounds/dandini.mp3') },
  { id: 3, name: 'Uyu da Büyü', icon: '🌟', file: require('../../assets/sounds/dandini.mp3') },
  { id: 4, name: 'Ninni Ninni', icon: '🎵', file: require('../../assets/sounds/dandini.mp3') },
];

const sabitKolikListesi: SesTip[] = [
  { id: 1, name: 'Beyaz Gürültü', icon: '💨', file: require('../../assets/sounds/dandini.mp3') },
  { id: 2, name: 'Yağmur Sesi', icon: '🌧️', file: require('../../assets/sounds/dandini.mp3') },
  { id: 3, name: 'Saç Kurutma', icon: '🔊', file: require('../../assets/sounds/dandini.mp3') },
  { id: 4, name: 'Araba Sesi', icon: '🚗', file: require('../../assets/sounds/dandini.mp3') },
];

function kaliteRenk(puan: number): string {
  if (puan >= 85) return '#4ade80';
  if (puan >= 70) return '#facc15';
  if (puan >= 50) return '#fb923c';
  return '#f87171';
}

function kaliteEtiket(puan: number): string {
  if (puan >= 85) return 'Mükemmel';
  if (puan >= 70) return 'İyi';
  if (puan >= 50) return 'Orta';
  return 'Zayıf';
}

function yorumGetir(rapor: GeceRaporu, onceki: GeceRaporu | null): string[] {
  const yorumlar: string[] = [];
  const baslangicSaat = new Date(rapor.baslangic).getHours();
  if (onceki) {
    const uyku_fark = rapor.toplamUyku - onceki.toplamUyku;
    const aglama_fark = rapor.aglamaSayisi - onceki.aglamaSayisi;
    const dalma_fark = rapor.uykulaDalma - onceki.uykulaDalma;
    if (uyku_fark >= 3600) yorumlar.push('Dün geceye göre ' + Math.floor(uyku_fark / 3600) + ' saat daha fazla uyudu 👏');
    else if (uyku_fark <= -3600) yorumlar.push('Dün geceye göre ' + Math.floor(Math.abs(uyku_fark) / 3600) + ' saat daha az uyudu 😔');
    if (aglama_fark < 0) yorumlar.push('Dün geceye göre ' + Math.abs(aglama_fark) + ' kez daha az uyandı 🌟');
    else if (aglama_fark > 0) yorumlar.push('Dün geceye göre ' + aglama_fark + ' kez daha fazla uyandı 😐');
    if (dalma_fark <= -300) yorumlar.push('Dün geceye göre daha hızlı uykuya daldı 👍');
  }
  if (rapor.aglamaSayisi === 0) yorumlar.push('Harika! Bebeğiniz gece boyunca hiç ağlamadı 🎉');
  if (baslangicSaat >= 19 && baslangicSaat <= 21) yorumlar.push('Düzenli uyku saatinde yatırdınız, bu çok iyi 👍');
  if (rapor.toplamUyku >= 32400) yorumlar.push('Bebeğiniz bu gece çok iyi dinlendi 💪');
  if (baslangicSaat >= 22) yorumlar.push((baslangicSaat - 1) + ':00\'da yatırmayı deneyin, daha kolay uyuyabilir');
  if (rapor.aglamaSayisi >= 3) yorumlar.push('Sık uyanmalar için kolik dedektörünü deneyebilirsiniz');
  if (yorumlar.length === 0) yorumlar.push('Gece verileriniz kaydedildi, daha fazla gece ekledikçe analizler gelişecek');
  return yorumlar;
}

function uykuSkoruHesapla(
  toplamUyku: number, aglamaSayisi: number, uykulaDalma: number, baslangicSaat: number
): { toplam: number; detaylar: { baslik: string; puan: number; pozitif: boolean }[] } {
  const detaylar: { baslik: string; puan: number; pozitif: boolean }[] = [];
  let toplam = 0;
  if (toplamUyku >= 32400) { detaylar.push({ baslik: 'Uzun uyku süresi (9s+)', puan: 40, pozitif: true }); toplam += 40; }
  else if (toplamUyku >= 25200) { detaylar.push({ baslik: 'İyi uyku süresi (7s+)', puan: 30, pozitif: true }); toplam += 30; }
  else if (toplamUyku >= 18000) { detaylar.push({ baslik: 'Orta uyku süresi (5s+)', puan: 20, pozitif: true }); toplam += 20; }
  else { detaylar.push({ baslik: 'Kısa uyku süresi', puan: -10, pozitif: false }); toplam -= 10; }
  if (aglamaSayisi === 0) { detaylar.push({ baslik: 'Hiç uyanmadı', puan: 30, pozitif: true }); toplam += 30; }
  else if (aglamaSayisi === 1) { detaylar.push({ baslik: 'Sadece 1 kez uyandı', puan: 22, pozitif: true }); toplam += 22; }
  else if (aglamaSayisi === 2) { detaylar.push({ baslik: '2 kez uyandı', puan: 14, pozitif: true }); toplam += 14; }
  else if (aglamaSayisi <= 4) { detaylar.push({ baslik: aglamaSayisi + ' kez uyandı', puan: 5, pozitif: false }); toplam += 5; }
  else { detaylar.push({ baslik: aglamaSayisi + ' kez uyandı (sık)', puan: -10, pozitif: false }); toplam -= 10; }
  if (uykulaDalma <= 300) { detaylar.push({ baslik: 'Çok hızlı uykuya daldı', puan: 20, pozitif: true }); toplam += 20; }
  else if (uykulaDalma <= 600) { detaylar.push({ baslik: 'Hızlı uykuya daldı', puan: 15, pozitif: true }); toplam += 15; }
  else if (uykulaDalma <= 1200) { detaylar.push({ baslik: 'Normal uykuya dalma', puan: 10, pozitif: true }); toplam += 10; }
  else { detaylar.push({ baslik: 'Geç uykuya daldı', puan: 0, pozitif: false }); }
  const saat = new Date(baslangicSaat).getHours();
  if (saat >= 19 && saat <= 21) { detaylar.push({ baslik: 'Düzenli uyku saati', puan: 10, pozitif: true }); toplam += 10; }
  else { detaylar.push({ baslik: 'Geç uyku saati', puan: 0, pozitif: false }); }
  return { toplam: Math.max(0, Math.min(100, toplam)), detaylar };
}

function yasOrtalamaYorum(toplamUyku: number, yasIndex: number): string {
  const ortalamaYaslar = [57600, 50400, 46800, 46800];
  if (toplamUyku >= ortalamaYaslar[yasIndex]) return 'Bebeğiniz yaş grubunun ortalamasının üzerinde uyudu 🌟';
  return 'Bebeğiniz yaş grubunun ortalamasına yakın uyudu';
}

function son7GunHazirla(raporlar: GeceRaporu[]) {
  const bugun = new Date();
  const gunler = [];
  for (let i = 6; i >= 0; i--) {
    const gun = new Date(bugun);
    gun.setDate(bugun.getDate() - i);
    const gunBaslangic = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate()).getTime();
    const gunBitis = gunBaslangic + 86400000;
    const rapor = raporlar.find(r => r.baslangic >= gunBaslangic && r.baslangic < gunBitis);
    gunler.push({ gun: gunIsimleri[gun.getDay()], tarih: gun.getDate(), puan: rapor ? rapor.uykuKalitesi : null, bugun: i === 0 });
  }
  return gunler;
}

function KarsilastirmaRow({ etiket, fark, formatFn, tersCizelge }: {
  etiket: string; fark: number; formatFn: (n: number) => string; tersCizelge?: boolean;
}) {
  const iyi = tersCizelge ? fark <= 0 : fark >= 0;
  const renk = iyi ? '#4ade80' : '#f87171';
  const ok = fark > 0 ? '🔼' : fark < 0 ? '🔽' : '➡️';
  const metin = fark === 0 ? 'Aynı' : formatFn(Math.abs(fark)) + (fark > 0 ? ' daha fazla' : ' daha az');
  return (
    <View style={styles.karsilastirmaRow}>
      <Text style={styles.karsilastirmaEtiket}>{etiket}</Text>
      <Text style={[styles.karsilastirmaDeger, { color: renk }]}>{ok + ' ' + metin}</Text>
    </View>
  );
}

function RaporIcerik({ rapor, onceki, seciliYas }: {
  rapor: GeceRaporu; onceki: GeceRaporu | null; seciliYas: number;
}) {
  const yorumlar = yorumGetir(rapor, onceki);
  const renk = kaliteRenk(rapor.uykuKalitesi);
  const etiket = kaliteEtiket(rapor.uykuKalitesi);
  const formatSure = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + 's ' + m + 'dk';
    return m + ' dk';
  };
  const formatSaat = (ts: number) => {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  };
  return (
    <View>
      <View style={[styles.skorDaire, { borderColor: renk }]}>
        <Text style={[styles.skorYazi, { color: renk }]}>{rapor.uykuKalitesi}</Text>
        <Text style={[styles.skorEtiket, { color: renk }]}>{etiket}</Text>
      </View>
      <View style={styles.kaliteBarKutu}>
        <View style={styles.kaliteBarArka}>
          <View style={[styles.kaliteBarOn, { width: (rapor.uykuKalitesi + '%') as any, backgroundColor: renk }]} />
        </View>
        <Text style={[styles.kaliteBarYazi, { color: renk }]}>{'%' + rapor.uykuKalitesi + ' — ' + etiket}</Text>
      </View>
      <View style={styles.statGrid}>
        <View style={styles.statItem}><Text style={styles.statDeger}>{formatSure(rapor.toplamUyku)}</Text><Text style={styles.statEtiket}>Toplam Uyku</Text></View>
        <View style={styles.statItem}><Text style={styles.statDeger}>{'Gece ' + rapor.aglamaSayisi + ' kez'}</Text><Text style={styles.statEtiket}>Ağlama</Text></View>
        <View style={styles.statItem}><Text style={styles.statDeger}>{formatSure(rapor.uykulaDalma)}</Text><Text style={styles.statEtiket}>Uykuya Dalma</Text></View>
        <View style={styles.statItem}><Text style={styles.statDeger}>{formatSure(rapor.enUzunUyku)}</Text><Text style={styles.statEtiket}>En Uzun Uyku</Text></View>
        <View style={styles.statItem}><Text style={styles.statDeger}>{formatSaat(rapor.baslangic)}</Text><Text style={styles.statEtiket}>Uyku Başlangıcı</Text></View>
        <View style={styles.statItem}><Text style={styles.statDeger}>{formatSaat(rapor.bitis)}</Text><Text style={styles.statEtiket}>Uyanma Saati</Text></View>
      </View>
      <View style={styles.puanDetayKutu}>
        <Text style={styles.puanDetayBaslik}>📊 Puan Detayı</Text>
        {rapor.puanDetay.map((d, i) => (
          <View key={i} style={styles.puanDetayRow}>
            <Text style={styles.puanDetayMetin}>{(d.pozitif ? '✅ ' : '❌ ') + d.baslik}</Text>
            <Text style={[styles.puanDetayPuan, { color: d.pozitif ? '#4ade80' : '#f87171' }]}>{d.puan > 0 ? '+' + d.puan : '' + d.puan}</Text>
          </View>
        ))}
      </View>
      <View style={styles.yasYorumKutu}>
        <Text style={styles.yasYorumYazi}>{'👶 ' + yasOrtalamaYorum(rapor.toplamUyku, seciliYas)}</Text>
      </View>
      <View style={styles.yorumKutu}>
        <Text style={styles.yorumBaslik}>💬 Analiz</Text>
        {yorumlar.map((y, i) => (<Text key={i} style={styles.yorumSatir}>{'• ' + y}</Text>))}
      </View>
      {onceki !== null && (
        <View style={styles.karsilastirmaKutu}>
          <Text style={styles.karsilastirmaBaslik}>📈 Dünle Karşılaştırma</Text>
          <KarsilastirmaRow etiket="Uyku Süresi" fark={rapor.toplamUyku - onceki.toplamUyku} formatFn={(n) => { const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60); return h > 0 ? h + 's ' + m + 'dk' : m + ' dk'; }} />
          <KarsilastirmaRow etiket="Ağlama" fark={rapor.aglamaSayisi - onceki.aglamaSayisi} formatFn={(n) => n + ' kez'} tersCizelge />
          <KarsilastirmaRow etiket="Uyku Skoru" fark={rapor.uykuKalitesi - onceki.uykuKalitesi} formatFn={(n) => n + ' puan'} />
        </View>
      )}
    </View>
  );
}

export default function Analiz() {
  const [uyuyorMu, setUyuyorMu] = useState(false);
  const [sure, setSure] = useState(0);
  const [aktifKayit, setAktifKayit] = useState<UykuKaydi | null>(null);
  const [seciliDetektor, setSeciliDetektor] = useState<DedektorTip | null>(null);
  const [seciliNinni, setSeciliNinni] = useState<SesTip | null>(null);
  const [seciliKolik, setSeciliKolik] = useState<SesTip | null>(null);
  const [sesListeModal, setSesListeModal] = useState(false);
  const [modalTip, setModalTip] = useState<DedektorTip | null>(null);
  const [dinleniyor, setDinleniyor] = useState(false);
  const [caliniyor, setCaliniyor] = useState(false);
  const [aglamaSayisi, setAglamaSayisi] = useState(0);
  const [raporModal, setRaporModal] = useState(false);
  const [sonRapor, setSonRapor] = useState<GeceRaporu | null>(null);
  const [geceRaporlari, setGeceRaporlari] = useState<GeceRaporu[]>([]);
  const [seciliRapor, setSeciliRapor] = useState<GeceRaporu | null>(null);
  const [detayModal, setDetayModal] = useState(false);
  const [seciliYas, setSeciliYas] = useState(0);
  const [acikHafta, setAcikHafta] = useState<string | null>(null);
  const [anneNinniUri, setAnneNinniUri] = useState<string | null>(null);
  const [annePisPisUri, setAnnePisPisUri] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const dinlemeRef = useRef(false);
  const caliyorRef = useRef(false);
  const calmaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geceBaslangicRef = useRef<number>(0);
  const aglamaSayisiRef = useRef(0);
  const aktifSesRef = useRef<SesTip | null>(null);
  const modalTipRef = useRef<DedektorTip | null>(null);
  const ilkAglamaZamaniRef = useRef<number | null>(null);
  const aktifKayitRef = useRef<UykuKaydi | null>(null);

  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });

  useEffect(() => {
    return () => { herSeyiDurdur(); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('anne_ninni_kayit').then(v => { if (v) setAnneNinniUri(JSON.parse(v).uri); });
    AsyncStorage.getItem('anne_pispis_kayit').then(v => { if (v) setAnnePisPisUri(JSON.parse(v).uri); });
  }, []);

  const herSeyiDurdur = async () => {
    dinlemeRef.current = false;
    caliyorRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (meteringRef.current) clearInterval(meteringRef.current);
    if (calmaTimerRef.current) clearTimeout(calmaTimerRef.current);
    try { await audioRecorder.stop(); } catch (_) {}
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
  };

  const formatSayac = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sn = s % 60;
    if (h > 0) return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ':' + sn.toString().padStart(2, '0');
    return m.toString().padStart(2, '0') + ':' + sn.toString().padStart(2, '0');
  };
  const formatSure = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? h + 's ' + m + 'dk' : m + ' dk'; };
  const formatSaat = (ts: number) => { const d = new Date(ts); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };
  const formatTarih = (ts: number) => { const d = new Date(ts); return d.getDate().toString().padStart(2, '0') + '.' + (d.getMonth() + 1).toString().padStart(2, '0') + '.' + d.getFullYear(); };
  const formatTarihGuzel = (ts: number) => { const d = new Date(ts); return gunIsimleri[d.getDay()] + ', ' + d.getDate() + ' ' + ayIsimleri[d.getMonth()] + ' ' + d.getFullYear(); };

  const haftaKeyGetir = (ts: number) => {
    const d = new Date(ts), gun = d.getDay(), haftaBasi = new Date(d);
    haftaBasi.setDate(d.getDate() - (gun === 0 ? 6 : gun - 1));
    return haftaBasi.getDate() + ' ' + ayIsimleri[haftaBasi.getMonth()] + ' ' + haftaBasi.getFullYear() + ' haftası';
  };

  const haftayaGoreGrupla = (raporlar: GeceRaporu[]) => {
    const gruplar: { [key: string]: GeceRaporu[] } = {};
    raporlar.forEach(r => { const key = haftaKeyGetir(r.baslangic); if (!gruplar[key]) gruplar[key] = []; gruplar[key].push(r); });
    return gruplar;
  };

  const bebekUyudu = () => {
    const yeniKayit: UykuKaydi = { id: Date.now(), baslangic: Date.now(), bitis: null };
    setAktifKayit(yeniKayit);
    aktifKayitRef.current = yeniKayit;
    setUyuyorMu(true);
    setSure(0);
    geceBaslangicRef.current = Date.now();
    aglamaSayisiRef.current = 0;
    ilkAglamaZamaniRef.current = null;
    setAglamaSayisi(0);
    timerRef.current = setInterval(() => setSure(s => s + 1), 1000);
  };

  const dedektoraBasildi = async (tip: DedektorTip) => {
    const izin = await AudioModule.requestRecordingPermissionsAsync();
    if (!izin.granted) { alert('Mikrofon izni gerekli!'); return; }
    modalTipRef.current = tip;
    setModalTip(tip);
    setSesListeModal(true);
  };

  const sesSecildi = async (ses: SesTip) => {
    const tip = modalTipRef.current!;
    setSesListeModal(false);
    if (tip === 'aglama') setSeciliNinni(ses);
    else setSeciliKolik(ses);
    setSeciliDetektor(tip);
    aktifSesRef.current = ses;
    if (dinlemeRef.current) {
      dinlemeRef.current = false; caliyorRef.current = false;
      if (meteringRef.current) clearInterval(meteringRef.current);
      try { await audioRecorder.stop(); } catch (_) {}
      if (soundRef.current) { try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
      setCaliniyor(false); setDinleniyor(false);
    }
    setTimeout(() => dinlemeBaslat(ses), 400);
  };

  const dinlemeBaslat = async (ses: SesTip) => {
    if (dinlemeRef.current) return;
    dinlemeRef.current = true;
    setDinleniyor(true);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      meteringRef.current = setInterval(() => {
        if (!dinlemeRef.current) { clearInterval(meteringRef.current!); return; }
        if (caliyorRef.current) return;
        const db = (audioRecorder as any).currentMeteringEntry?.averagePower;
        if (db !== undefined && db > AGLAMA_ESIGI_DB) { const g = aktifSesRef.current; if (g) sesCaldir(g); }
      }, 500);
    } catch (e) { dinlemeRef.current = false; setDinleniyor(false); }
  };

  const sesCaldir = async (ses: SesTip) => {
    if (caliyorRef.current) return;
    caliyorRef.current = true; setCaliniyor(true);
    aglamaSayisiRef.current += 1; setAglamaSayisi(aglamaSayisiRef.current);
    if (!ilkAglamaZamaniRef.current) ilkAglamaZamaniRef.current = Date.now();
    try {
      try { await audioRecorder.stop(); } catch (_) {}
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
      if (soundRef.current) { try { await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
      const { sound } = await Audio.Sound.createAsync(ses.file, { shouldPlay: true, isLooping: true });
      soundRef.current = sound;
      calmaTimerRef.current = setTimeout(async () => {
        if (!dinlemeRef.current) return;
        try { await sound.stopAsync(); await sound.unloadAsync(); } catch (_) {}
        soundRef.current = null; caliyorRef.current = false; setCaliniyor(false);
        const g = aktifSesRef.current;
        if (g && dinlemeRef.current) {
          dinlemeRef.current = false; setDinleniyor(false);
          await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true });
          setTimeout(() => dinlemeBaslat(g), 300);
        }
      }, 15 * 60 * 1000);
    } catch (e) { caliyorRef.current = false; setCaliniyor(false); }
  };

  const bebekUyandi = async () => {
    await herSeyiDurdur();
    const bitis = Date.now(), baslangic = geceBaslangicRef.current;
    const toplamUyku = Math.floor((bitis - baslangic) / 1000);
    const uykulaDalma = ilkAglamaZamaniRef.current ? Math.max(120, Math.floor((ilkAglamaZamaniRef.current - baslangic) / 1000)) : Math.max(120, Math.floor(toplamUyku * 0.05));
    const enUzunUyku = aglamaSayisiRef.current === 0 ? toplamUyku : Math.floor(toplamUyku / (aglamaSayisiRef.current + 1));
    const skorSonuc = uykuSkoruHesapla(toplamUyku, aglamaSayisiRef.current, uykulaDalma, baslangic);
    const rapor: GeceRaporu = { id: Date.now(), tarih: formatTarih(baslangic), toplamUyku, aglamaSayisi: aglamaSayisiRef.current, baslangic, bitis, uykulaDalma, enUzunUyku, uykuKalitesi: skorSonuc.toplam, puanDetay: skorSonuc.detaylar };
    setGeceRaporlari(prev => { const yeni = [rapor, ...prev]; setSonRapor(rapor); return yeni; });
    setRaporModal(true);
    aktifKayitRef.current = null; setAktifKayit(null); setUyuyorMu(false); setSure(0);
    setSeciliDetektor(null); setSeciliNinni(null); setSeciliKolik(null);
    setDinleniyor(false); setCaliniyor(false); setAglamaSayisi(0); aktifSesRef.current = null;
  };

  const raporDetayAc = (rapor: GeceRaporu) => { setSeciliRapor(rapor); setDetayModal(true); };
  const oncekiRaporGetir = (rapor: GeceRaporu): GeceRaporu | null => {
    const idx = geceRaporlari.findIndex(r => r.id === rapor.id);
    return idx < geceRaporlari.length - 1 ? geceRaporlari[idx + 1] : null;
  };

  const haftalikGruplar = haftayaGoreGrupla(geceRaporlari);
  const haftaAnahtarlari = Object.keys(haftalikGruplar);
  const son7Gun = son7GunHazirla(geceRaporlari);

  const sesList = modalTip === 'aglama'
    ? [...(anneNinniUri ? [{ id: 999, name: 'Anne Sesi Ninnisi', icon: '💜', file: { uri: anneNinniUri } }] : []), ...sabitNinniListesi]
    : [...(annePisPisUri ? [{ id: 998, name: 'Anne Sesi Pış Pış', icon: '💜', file: { uri: annePisPisUri } }] : []), ...sabitKolikListesi];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Ses Tabanlı Analiz Bilgi Kartı */}
        <View style={styles.analizBilgiKart}>
          <Text style={styles.analizBilgiBaslik}>🎙 Ses Tabanlı Tahmini Uyku Analizi</Text>
          <Text style={styles.analizBilgiAlt}>Bu veriler mikrofon sesine dayalı tahmindir, tıbbi teşhis değildir.</Text>
        </View>

        {/* Uyku Kartı */}
        <View style={styles.sleepCard}>
          <Text style={styles.sleepStatus}>
            {!uyuyorMu ? '👀 Bebeğim uyanık'
              : caliniyor ? ('🎵 ' + (seciliDetektor === 'aglama' ? 'Ninni' : 'Beyaz gürültü') + ' çalıyor...')
              : dinleniyor ? '👂 Dinleniyor...'
              : '😴 Bebeğim uyuyor'}
          </Text>
          <Text style={styles.sleepClock}>{formatSayac(sure)}</Text>
          {uyuyorMu && seciliDetektor !== null && (
            <View style={styles.aktifBilgi}>
              <Text style={styles.aktifBilgiText}>{(seciliDetektor === 'aglama' ? '🎵 Ağlama Dedektörü' : '🌿 Kolik Dedektörü') + ' aktif'}</Text>
              {seciliDetektor === 'aglama' && seciliNinni !== null && <Text style={styles.aktifSesText}>{seciliNinni.icon + ' ' + seciliNinni.name}</Text>}
              {seciliDetektor === 'kolik' && seciliKolik !== null && <Text style={styles.aktifSesText}>{seciliKolik.icon + ' ' + seciliKolik.name}</Text>}
              {aglamaSayisi > 0 && <Text style={styles.aglamaSayisiText}>{'😢 ' + aglamaSayisi + ' kez ağladı'}</Text>}
            </View>
          )}
          <TouchableOpacity style={[styles.sleepBtn, uyuyorMu && styles.sleepBtnUyaniyor]} onPress={uyuyorMu ? bebekUyandi : bebekUyudu}>
            <Text style={styles.sleepBtnText}>{uyuyorMu ? '🌅 Bebeğim Uyandı' : '😴 Bebeğim Uyudu'}</Text>
          </TouchableOpacity>
        </View>

        {/* Dedektör Kartları */}
        {uyuyorMu && (
          <View style={styles.dedektorSection}>
            <Text style={styles.dedektorBaslik}>🌙 Gece modunu seçin:</Text>
            <View style={styles.dedektorRow}>
              <TouchableOpacity style={[styles.dedektorKart, seciliDetektor === 'aglama' && styles.dedektorKartAktif]} onPress={() => dedektoraBasildi('aglama')}>
                <Text style={styles.dedektorKartIkon}>🎵</Text>
                <Text style={styles.dedektorKartBaslik}>{'Ağlama\nDedektörü'}</Text>
                <Text style={styles.dedektorKartAcik}>Ağlayınca ninni başlar</Text>
                {seciliNinni !== null && <View style={styles.sesBadge}><Text style={styles.sesBadgeText}>{seciliNinni.icon + ' ' + seciliNinni.name}</Text></View>}
                {seciliDetektor === 'aglama' && <View style={styles.aktifBadge}><Text style={styles.aktifBadgeText}>● AKTİF</Text></View>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dedektorKart, seciliDetektor === 'kolik' && styles.dedektorKartAktifKolik]} onPress={() => dedektoraBasildi('kolik')}>
                <Text style={styles.dedektorKartIkon}>🌿</Text>
                <Text style={styles.dedektorKartBaslik}>{'Kolik\nDedektörü'}</Text>
                <Text style={styles.dedektorKartAcik}>Ağlayınca beyaz gürültü başlar</Text>
                {seciliKolik !== null && <View style={[styles.sesBadge, styles.sesBadgeKolik]}><Text style={styles.sesBadgeText}>{seciliKolik.icon + ' ' + seciliKolik.name}</Text></View>}
                {seciliDetektor === 'kolik' && <View style={[styles.aktifBadge, styles.aktifBadgeKolik]}><Text style={styles.aktifBadgeText}>● AKTİF</Text></View>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Geçmiş Geceler */}
        <Text style={styles.bolumBaslik}>Geçmiş Geceler</Text>
        {geceRaporlari.length === 0 ? (
          <View style={styles.bosKutu}><Text style={styles.bosKutuIkon}>📊</Text><Text style={styles.bosKutuYazi}>Henüz gece raporu yok</Text></View>
        ) : (
          haftaAnahtarlari.map((hafta) => (
            <View key={hafta} style={styles.haftaGrubu}>
              <TouchableOpacity style={styles.haftaBaslikRow} onPress={() => setAcikHafta(acikHafta === hafta ? null : hafta)}>
                <Text style={styles.haftaBaslikYazi}>{'📅 ' + hafta}</Text>
                <Text style={styles.haftaOk}>{acikHafta === hafta ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {acikHafta === hafta && haftalikGruplar[hafta].map((r) => (
                <TouchableOpacity key={r.id} style={styles.geceRow} onPress={() => raporDetayAc(r)}>
                  <View style={styles.geceRowSol}>
                    <Text style={styles.geceTarih}>{formatTarihGuzel(r.baslangic)}</Text>
                    <Text style={styles.geceSaat}>{formatSaat(r.baslangic) + ' → ' + formatSaat(r.bitis) + ' · ' + formatSure(r.toplamUyku)}</Text>
                  </View>
                  <View style={styles.geceRowSag}>
                    <View style={[styles.puanDaire, { borderColor: kaliteRenk(r.uykuKalitesi) }]}>
                      <Text style={[styles.puanYazi, { color: kaliteRenk(r.uykuKalitesi) }]}>{r.uykuKalitesi}</Text>
                    </View>
                    <Text style={styles.geceOk}>›</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}

        {/* 7 Günlük Grafik */}
        <Text style={styles.bolumBaslik}>7 Günlük Uyku Skoru</Text>
        <View style={styles.grafikKart}>
          <View style={styles.grafikIcerik}>
            {son7Gun.map((g, i) => {
              const barH = g.puan !== null ? Math.max(4, (g.puan / 100) * BAR_MAX_HEIGHT) : 4;
              const renk = g.puan !== null ? kaliteRenk(g.puan) : 'rgba(255,255,255,0.1)';
              return (
                <View key={i} style={styles.grafikSutun}>
                  <Text style={[styles.grafikPuanText, { color: g.puan !== null ? renk : 'transparent' }]}>{g.puan !== null ? '' + g.puan : ' '}</Text>
                  <View style={[styles.grafikBarAlani, { height: BAR_MAX_HEIGHT }]}>
                    <View style={[styles.grafikBar, { height: barH, backgroundColor: renk, opacity: g.bugun ? 1 : 0.7 }]} />
                  </View>
                  <Text style={[styles.grafikGun, g.bugun && styles.grafikGunBugun]}>{g.gun}</Text>
                  <Text style={styles.grafikTarih}>{'' + g.tarih}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.grafikAciklama}>
            {[{ renk: '#4ade80', yazi: 'Mükemmel 85+' }, { renk: '#facc15', yazi: 'İyi 70-84' }, { renk: '#fb923c', yazi: 'Orta 50-69' }, { renk: '#f87171', yazi: 'Zayıf 0-49' }].map((item) => (
              <View key={item.yazi} style={styles.grafikAciklamaRow}>
                <View style={[styles.grafikAciklamaNokta, { backgroundColor: item.renk }]} />
                <Text style={styles.grafikAciklamaYazi}>{item.yazi}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Uzman Önerileri */}
        <Text style={styles.bolumBaslik}>Uzman Önerileri</Text>
        <View style={styles.yasSecici}>
          {['0-3 ay', '3-6 ay', '6-12 ay', '1+ yaş'].map((y, i) => (
            <TouchableOpacity key={y} style={[styles.yasBtn, seciliYas === i && styles.yasBtnAktif]} onPress={() => setSeciliYas(i)}>
              <Text style={[styles.yasBtnYazi, seciliYas === i && styles.yasBtnYaziAktif]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.ipucuKart}>
          <Text style={styles.ipucuYazi}>{'🧠 🌙 ' + uzmanOnerileri[seciliYas]}</Text>
        </View>

      </ScrollView>

      {/* SES SEÇİM MODALI */}
      <Modal visible={sesListeModal} transparent animationType="slide" onRequestClose={() => setSesListeModal(false)}>
        <View style={styles.modalArkaPlan}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSesListeModal(false)} />
          <View style={styles.modalKutu}>
            <View style={styles.modalKol} />
            <Text style={styles.modalBaslik}>{modalTip === 'aglama' ? '🎵 Ninni Seç' : '🌿 Kolik Sesi Seç'}</Text>
            <Text style={styles.modalAltBaslik}>{modalTip === 'aglama' ? 'Bebek ağladığında bu ninni çalacak (15 dk)' : 'Bebek ağladığında bu ses çalacak (15 dk)'}</Text>
            <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
              {sesList.map((ses) => {
                const secili = modalTip === 'aglama' ? seciliNinni?.id === ses.id : seciliKolik?.id === ses.id;
                return (
                  <TouchableOpacity key={ses.id} style={[styles.sesBtn, secili && styles.sesBtnSecili, ses.id >= 998 && styles.sesBtnAnne]} onPress={() => sesSecildi(ses)}>
                    <Text style={styles.sesIkon}>{ses.icon}</Text>
                    <Text style={styles.sesAdi}>{ses.name}</Text>
                    {ses.id >= 998 && <Text style={styles.sesAnneEtiket}>💜</Text>}
                    {secili && <Text style={styles.sesTik}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* YENİ GECE RAPORU MODALI */}
      <Modal visible={raporModal} transparent animationType="fade" onRequestClose={() => setRaporModal(false)}>
        <View style={styles.raporModalArkaPlan}>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={styles.raporModalKutu}>
              <Text style={styles.raporModalBaslik}>🌅 Gece Raporu</Text>
              {sonRapor !== null && (
                <View>
                  <Text style={styles.raporModalTarih}>{formatTarihGuzel(sonRapor.baslangic)}</Text>
                  <RaporIcerik rapor={sonRapor} onceki={geceRaporlari.length > 1 ? geceRaporlari[1] : null} seciliYas={seciliYas} />
                </View>
              )}
              <TouchableOpacity style={[styles.raporModalBtn, { marginTop: 16 }]} onPress={() => setRaporModal(false)}>
                <Text style={styles.raporModalBtnYazi}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* GEÇMİŞ GECE DETAY MODALI */}
      <Modal visible={detayModal} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={() => setDetayModal(false)}>
        <View style={styles.detayModalArkaPlan}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetayModal(false)} />
          <View style={styles.detayModalKutu}>
            <View style={styles.modalKol} />
            {seciliRapor !== null && (
              <View style={{ flex: 1 }}>
                <Text style={styles.modalBaslik}>🌙 Gece Raporu</Text>
                <Text style={styles.modalAltBaslik}>{formatTarihGuzel(seciliRapor.baslangic)}</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator bounces alwaysBounceVertical nestedScrollEnabled>
                  <RaporIcerik rapor={seciliRapor} onceki={oncekiRaporGetir(seciliRapor)} seciliYas={seciliYas} />
                </ScrollView>
                <TouchableOpacity style={[styles.raporModalBtn, { marginTop: 12 }]} onPress={() => setDetayModal(false)}>
                  <Text style={styles.raporModalBtnYazi}>Kapat</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  analizBilgiKart: { backgroundColor: 'rgba(157,140,239,0.12)', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)' },
  analizBilgiBaslik: { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  analizBilgiAlt: { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 16 },
  sleepCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 22, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  sleepStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  sleepClock: { color: 'white', fontSize: 52, fontWeight: 'bold' },
  aktifBilgi: { alignItems: 'center', gap: 4 },
  aktifBilgiText: { color: '#b8a8f8', fontSize: 13 },
  aktifSesText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  aglamaSayisiText: { color: '#f59e0b', fontSize: 12 },
  sleepBtn: { backgroundColor: 'rgba(157,140,239,0.25)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)', width: '100%', alignItems: 'center' },
  sleepBtnUyaniyor: { backgroundColor: 'rgba(74,222,128,0.2)', borderColor: 'rgba(74,222,128,0.4)' },
  sleepBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  dedektorSection: { marginBottom: 20 },
  dedektorBaslik: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  dedektorRow: { flexDirection: 'row', gap: 10 },
  dedektorKart: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 6 },
  dedektorKartAktif: { backgroundColor: 'rgba(157,140,239,0.15)', borderColor: '#9d8cef' },
  dedektorKartAktifKolik: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: '#4ade80' },
  dedektorKartIkon: { fontSize: 30 },
  dedektorKartBaslik: { color: 'white', fontSize: 13, fontWeight: 'bold', textAlign: 'center', lineHeight: 18 },
  dedektorKartAcik: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  sesBadge: { backgroundColor: 'rgba(157,140,239,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  sesBadgeKolik: { backgroundColor: 'rgba(74,222,128,0.2)' },
  sesBadgeText: { color: 'white', fontSize: 10 },
  aktifBadge: { backgroundColor: 'rgba(157,140,239,0.3)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  aktifBadgeKolik: { backgroundColor: 'rgba(74,222,128,0.25)' },
  aktifBadgeText: { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },
  bolumBaslik: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 4 },
  bosKutu: { alignItems: 'center', padding: 24, gap: 8, marginBottom: 12 },
  bosKutuIkon: { fontSize: 32 },
  bosKutuYazi: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  haftaGrubu: { marginBottom: 12 },
  haftaBaslikRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  haftaBaslikYazi: { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  haftaOk: { color: '#b8a8f8', fontSize: 14 },
  geceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  geceRowSol: { flex: 1 },
  geceTarih: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  geceSaat: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  geceRowSag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  puanDaire: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  puanYazi: { fontSize: 13, fontWeight: 'bold' },
  geceOk: { color: 'rgba(255,255,255,0.4)', fontSize: 22 },
  grafikKart: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  grafikIcerik: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  grafikSutun: { flex: 1, alignItems: 'center', gap: 4 },
  grafikPuanText: { fontSize: 9, fontWeight: 'bold', height: 14, textAlign: 'center' },
  grafikBarAlani: { width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  grafikBar: { width: '60%', borderRadius: 4 },
  grafikGun: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 },
  grafikGunBugun: { color: '#b8a8f8', fontWeight: 'bold' },
  grafikTarih: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
  grafikAciklama: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  grafikAciklamaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grafikAciklamaNokta: { width: 8, height: 8, borderRadius: 4 },
  grafikAciklamaYazi: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  yasSecici: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  yasBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  yasBtnAktif: { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  yasBtnYazi: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  yasBtnYaziAktif: { color: '#b8a8f8', fontWeight: 'bold' },
  ipucuKart: { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', marginBottom: 8 },
  ipucuYazi: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 22 },
  modalArkaPlan: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalKutu: { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalKol: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 20, alignSelf: 'center' },
  modalBaslik: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modalAltBaslik: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 },
  sesBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sesBtnSecili: { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  sesBtnAnne: { backgroundColor: 'rgba(157,140,239,0.08)', borderColor: 'rgba(157,140,239,0.3)' },
  sesIkon: { fontSize: 26 },
  sesAdi: { color: 'white', fontSize: 15, fontWeight: 'bold', flex: 1 },
  sesAnneEtiket: { fontSize: 16 },
  sesTik: { color: '#9d8cef', fontSize: 20, fontWeight: 'bold' },
  raporModalArkaPlan: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  raporModalKutu: { backgroundColor: '#0f1e33', borderRadius: 24, padding: 24 },
  raporModalBaslik: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  raporModalTarih: { color: '#b8a8f8', fontSize: 14, marginBottom: 20, textAlign: 'center' },
  raporModalBtn: { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center' },
  raporModalBtnYazi: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  detayModalArkaPlan: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  detayModalKutu: { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, height: '92%' },
  skorDaire: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  skorYazi: { fontSize: 36, fontWeight: 'bold' },
  skorEtiket: { fontSize: 12, fontWeight: 'bold' },
  kaliteBarKutu: { alignItems: 'center', marginBottom: 16 },
  kaliteBarArka: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  kaliteBarOn: { height: 10, borderRadius: 5 },
  kaliteBarYazi: { fontSize: 12, fontWeight: 'bold' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statItem: { width: '47%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, alignItems: 'center' },
  statDeger: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  statEtiket: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3, textAlign: 'center' },
  puanDetayKutu: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  puanDetayBaslik: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  puanDetayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  puanDetayMetin: { color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 },
  puanDetayPuan: { fontSize: 12, fontWeight: 'bold' },
  yasYorumKutu: { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)' },
  yasYorumYazi: { color: '#b8a8f8', fontSize: 12, lineHeight: 18 },
  yorumKutu: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  yorumBaslik: { color: 'white', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  yorumSatir: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 20, marginBottom: 4 },
  karsilastirmaKutu: { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', marginBottom: 12 },
  karsilastirmaBaslik: { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  karsilastirmaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  karsilastirmaEtiket: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  karsilastirmaDeger: { fontSize: 12, fontWeight: 'bold' },
});