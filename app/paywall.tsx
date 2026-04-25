import { getOfferings, purchasePackage, restorePurchases } from '@/services/revenuecat';
import { s as rsp } from '@/constants/responsive';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PlanId = 'monthly' | 'yearly';

interface Plan {
  id: PlanId;
  pkg: any;
  title: string;
  price: string;
  period: string;
  badge?: string;
}

export default function PaywallScreen() {
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [selected, setSelected]     = useState<PlanId>('yearly');
  const [loading, setLoading]       = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    try {
      setLoading(true);
      setError(null);
      const offering = await getOfferings();
      if (!offering?.availablePackages?.length) {
        setError('Planlar yüklenemedi. Lütfen tekrar deneyin.');
        return;
      }

      const built: Plan[] = [];
      for (const pkg of offering.availablePackages) {
        const pid = pkg.identifier as string;
        const price: string = pkg.product?.priceString ?? '';
        if (pid.includes('monthly') || pid === '$rc_monthly') {
          built.push({ id: 'monthly', pkg, title: 'Aylık Plan', price: price || '$6.99', period: 'ay' });
        } else if (pid.includes('yearly') || pid === '$rc_annual') {
          built.push({ id: 'yearly', pkg, title: 'Yıllık Plan', price: price || '$49.99', period: 'yıl', badge: '%40 Tasarruf' });
        }
      }
      // Ensure yearly first
      built.sort((a, b) => (a.id === 'yearly' ? -1 : 1));
      setPlans(built);
    } catch {
      setError('Planlar yüklenemedi. İnternet bağlantınızı kontrol edin.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase() {
    const plan = plans.find(p => p.id === selected);
    if (!plan) return;
    try {
      setPurchasing(true);
      setError(null);
      await purchasePackage(plan.pkg);
      Alert.alert('Teşekkürler!', 'Premium üyeliğiniz aktif edildi.', [
        { text: 'Harika!', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      if (e?.userCancelled) return;
      setError('Satın alma işlemi başarısız. Lütfen tekrar deneyin.');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    try {
      setRestoring(true);
      setError(null);
      const isPremium = await restorePurchases();
      if (isPremium) {
        Alert.alert('Başarılı', 'Satın alımlarınız geri yüklendi.', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Bulunamadı', 'Bu hesaba ait aktif bir satın alım bulunamadı.');
      }
    } catch {
      setError('Geri yükleme başarısız. Lütfen tekrar deneyin.');
    } finally {
      setRestoring(false);
    }
  }

  const selectedPlan = plans.find(p => p.id === selected);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>

        <Text style={s.crown}>👑</Text>
        <Text style={s.title}>LumiBaby Premium</Text>
        <Text style={s.subtitle}>Tüm özelliklerin kilidini aç, bebeğinle daha derin bağ kur.</Text>

        {/* Features */}
        <View style={s.featureList}>
          {FEATURES.map(f => (
            <View key={f} style={s.featureRow}>
              <Text style={s.featureCheck}>✓</Text>
              <Text style={s.featureTxt}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Plans */}
        {loading ? (
          <ActivityIndicator size="large" color="#9d8cef" style={{ marginVertical: 32 }} />
        ) : error && plans.length === 0 ? (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={loadOfferings}>
              <Text style={s.retryTxt}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.planList}>
            {plans.map(plan => (
              <TouchableOpacity
                key={plan.id}
                style={[s.planCard, selected === plan.id && s.planCardSelected]}
                onPress={() => setSelected(plan.id)}
                activeOpacity={0.8}
              >
                {plan.badge && (
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{plan.badge}</Text>
                  </View>
                )}
                <View style={s.planRow}>
                  <View style={[s.radio, selected === plan.id && s.radioSelected]}>
                    {selected === plan.id && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planTitle}>{plan.title}</Text>
                    <Text style={s.planPeriod}>{plan.price} / {plan.period}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error && plans.length > 0 && (
          <Text style={[s.errorTxt, { textAlign: 'center', marginBottom: 8 }]}>{error}</Text>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, (purchasing || loading || plans.length === 0) && s.ctaBtnDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || loading || plans.length === 0}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.ctaTxt}>
                {selectedPlan ? `${selectedPlan.price} ile Başla` : 'Premium\'a Geç'}
              </Text>
              <Text style={s.ctaSubTxt}>7 gün ücretsiz deneme — İstediğinde iptal et</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring
            ? <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
            : <Text style={s.restoreTxt}>Satın Alımları Geri Yükle</Text>
          }
        </TouchableOpacity>

        <Text style={s.legal}>
          Abonelik otomatik yenilenir. iTunes hesabınızdan ücret alınır. Yenileme döneminin en az 24 saat öncesinde iptal edilmediği sürece abonelik yenilenir.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const FEATURES = [
  'Sınırsız ağlama analizi',
  'YAMNet AI bebek tespiti',
  'Sınırsız ninni & uyku müzikleri',
  'Kolik & ağrı rehberi',
  'Kişisel ses hikayeleri',
  'Reklamsız deneyim',
];

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#07101e' },
  scroll:           { padding: 24, paddingBottom: 48 },
  closeBtn:         { alignSelf: 'flex-end', padding: 8, marginBottom: 8 },
  closeTxt:         { color: 'rgba(255,255,255,0.4)', fontSize: 18 },
  crown:            { fontSize: 52, textAlign: 'center', marginBottom: 12 },
  title:            { color: 'white', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle:         { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  featureList:      { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 16, padding: 16, marginBottom: 28, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  featureCheck:     { color: '#9d8cef', fontSize: 16, fontWeight: 'bold', width: 20 },
  featureTxt:       { color: 'rgba(255,255,255,0.8)', fontSize: 14, flex: 1 },

  planList:         { gap: 12, marginBottom: 24 },
  planCard:         { borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 16 },
  planCardSelected: { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.12)' },
  planRow:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio:            { width: rsp(22), height: rsp(22), borderRadius: rsp(11), borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioSelected:    { borderColor: '#9d8cef' },
  radioDot:         { width: rsp(11), height: rsp(11), borderRadius: rsp(6), backgroundColor: '#9d8cef' },
  planTitle:        { color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  planPeriod:       { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  badge:            { alignSelf: 'flex-start', backgroundColor: '#e879a0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 },
  badgeTxt:         { color: 'white', fontSize: 11, fontWeight: 'bold' },

  ctaBtn:           { backgroundColor: '#9d8cef', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12, minHeight: 60, justifyContent: 'center' },
  ctaBtnDisabled:   { opacity: 0.5 },
  ctaTxt:           { color: 'white', fontSize: 17, fontWeight: 'bold' },
  ctaSubTxt:        { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3 },

  restoreBtn:       { paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  restoreTxt:       { color: 'rgba(255,255,255,0.35)', fontSize: 13 },

  errorBox:         { alignItems: 'center', marginVertical: 24, gap: 12 },
  errorTxt:         { color: '#ff6b6b', fontSize: 13, textAlign: 'center' },
  retryBtn:         { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt:         { color: '#9d8cef', fontSize: 14, fontWeight: '600' },

  legal:            { color: 'rgba(255,255,255,0.2)', fontSize: 10, textAlign: 'center', lineHeight: 15 },
});
