import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { formatCurrency, formatTransactionDate, getOwnerTransactions, subscribeToOwnerTransactions } from '../../../api/transactionService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PAYMENT_STATUS_STYLE = {
  Paid: { badge: 'statusBadgeGood', text: 'statusBadgeGoodText' },
  Partial: { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  Unpaid: { badge: 'statusBadgeRisk', text: 'statusBadgeRiskText' },
  Voided: { badge: 'statusBadgeNeutral', text: 'statusBadgeNeutralText' },
  Cancelled: { badge: 'statusBadgeNeutral', text: 'statusBadgeNeutralText' },
};

export default function PetOwnerPayHis({ navigation, route }) {
  const user = route?.params?.user;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || user?.full_name || 'Pet Owner';
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const loadTransactions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await getOwnerTransactions(user.id);
      setTransactions(rows);
      setError('');
    } catch (e) {
      setError(e?.message || 'Unable to load your payment history.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
      const unsubscribe = subscribeToOwnerTransactions(user?.id, loadTransactions);
      return () => { unsubscribe?.(); };
    }, [user?.id, loadTransactions])
  );

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>Payment History</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user })} activeOpacity={0.85}><View style={styles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" /></TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user })} activeOpacity={0.85}><Image source={profileImageUri ? { uri: profileImageUri } : DEFAULT_PROFILE_IMAGE} style={profileImageUri ? styles.profileButtonImage : styles.profileIcon} resizeMode={profileImageUri ? 'cover' : 'contain'} /></TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={() => setIsHeaderMenuVisible(true)} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            <View style={styles.ownerSummary}><Text style={styles.headerCaption}>Invoices and receipts from your visits</Text><Text style={styles.ownerName}>{headerDisplayName}</Text></View>
          </View>
          <PetOwnerSideDrawer visible={isHeaderMenuVisible} onClose={() => setIsHeaderMenuVisible(false)} navigation={navigation} user={user} activeKey="payment-history" />
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={localStyles.scrollContent}>
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Payment History</Text>
            <Text style={styles.sectionSubtitle}>Every invoice recorded for your visits</Text>
          </View>

          {loading ? (
            <View style={localStyles.stateCard}><ActivityIndicator color="#447C99" /><Text style={localStyles.stateText}>Loading payment history...</Text></View>
          ) : null}

          {!loading && error ? (
            <View style={localStyles.stateCard}>
              <Text style={localStyles.errorText}>{error}</Text>
              <TouchableOpacity style={localStyles.retryButton} onPress={loadTransactions} activeOpacity={0.9}>
                <Text style={localStyles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && !error && !transactions.length ? (
            <View style={localStyles.stateCard}>
              <Text style={localStyles.emptyTitle}>No payment history yet</Text>
              <Text style={localStyles.stateText}>Invoices from your clinic visits will appear here automatically.</Text>
            </View>
          ) : null}

          {!loading && !error ? transactions.map((transaction) => {
            const expanded = expandedId === transaction.id;
            const statusStyle = PAYMENT_STATUS_STYLE[transaction.payment_status] || PAYMENT_STATUS_STYLE.Unpaid;
            const items = transaction.transaction_items || [];

            return (
              <TouchableOpacity
                key={transaction.id}
                style={localStyles.txCard}
                activeOpacity={0.9}
                onPress={() => setExpandedId(expanded ? '' : transaction.id)}
                accessibilityRole="button"
                accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} invoice ${transaction.or_number || ''}`}
              >
                <View style={localStyles.txTopRow}>
                  <View>
                    <Text style={localStyles.txPetName}>{transaction.pet?.pet_name || 'General'}</Text>
                    <Text style={localStyles.txDate}>{formatTransactionDate(transaction.created_at)}</Text>
                  </View>
                  <View style={[styles.statusBadge, styles[statusStyle.badge]]}>
                    <Text style={[styles.statusBadgeText, styles[statusStyle.text]]}>{transaction.payment_status || 'Unpaid'}</Text>
                  </View>
                </View>

                <View style={localStyles.txTotalsRow}>
                  <Text style={localStyles.txAmountLabel}>Total</Text>
                  <Text style={localStyles.txAmount}>{formatCurrency(transaction.total_amount)}</Text>
                </View>

                {expanded ? (
                  <View style={localStyles.txExpanded}>
                    {transaction.or_number ? <Text style={localStyles.txDetailLine}>OR Number: {transaction.or_number}</Text> : null}
                    <Text style={localStyles.txDetailLine}>Payment Method: {transaction.payment_method || 'Not recorded'}</Text>
                    <Text style={localStyles.txDetailLine}>Amount Paid: {formatCurrency(transaction.amount_paid)}</Text>
                    {transaction.discount_amount ? <Text style={localStyles.txDetailLine}>Discount: {formatCurrency(transaction.discount_amount)}</Text> : null}
                    {items.length ? (
                      <View style={localStyles.itemsBlock}>
                        <Text style={localStyles.itemsTitle}>Items</Text>
                        {items.map((item) => (
                          <View key={item.id} style={localStyles.itemRow}>
                            <Text style={localStyles.itemName}>{item.item_name} × {item.quantity}</Text>
                            <Text style={localStyles.itemPrice}>{formatCurrency(item.line_total)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {transaction.notes ? <Text style={localStyles.txDetailLine}>Notes: {transaction.notes}</Text> : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120 },
  stateCard: { backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 22, alignItems: 'center', marginBottom: 16 },
  stateText: { marginTop: 10, color: '#67889a', fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  errorText: { color: '#a33b3b', fontWeight: '800', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#447C99', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '900' },
  emptyTitle: { color: '#24566d', fontSize: 17, fontWeight: '900' },
  txCard: { backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  txTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  txPetName: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  txDate: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#64869a' },
  txTotalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#edf4f8' },
  txAmountLabel: { fontSize: 12, fontWeight: '800', color: '#7892a0', textTransform: 'uppercase' },
  txAmount: { fontSize: 18, fontWeight: '900', color: '#24566d' },
  txExpanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#edf4f8' },
  txDetailLine: { fontSize: 12.5, fontWeight: '700', color: '#5f7f94', marginBottom: 6, lineHeight: 18 },
  itemsBlock: { marginTop: 6, marginBottom: 6 },
  itemsTitle: { fontSize: 11, fontWeight: '900', color: '#7892a0', textTransform: 'uppercase', marginBottom: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#24566d', marginRight: 10 },
  itemPrice: { fontSize: 12.5, fontWeight: '800', color: '#24566d' },
});
