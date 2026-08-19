import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { approveVerification, getVerificationSignedUrl, listVerificationsForAdmin, rejectVerification } from '../../../api/vetVerificationService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'verification', label: 'Veterinarian Verification', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminVetVerification' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
];
const STATUS_FILTERS = ['All', 'Pending Review', 'Verified', 'Unverified'];

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');
const getVetName = (item) => item?.veterinarian?.full_name || item?.veterinarian?.username || 'Unknown veterinarian';
const getStatusColors = (status) =>
  status === 'Verified' ? { bg: '#e7f7ec', border: '#bfe8cc', text: '#1f9d55' }
    : status === 'Pending Review' ? { bg: '#fff4e0', border: '#f4dfb0', text: '#a9750c' }
      : { bg: '#eef1f4', border: '#dde5ea', text: '#5f7f8a' };

const AdminVetVerification = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const reviewerId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = useState(() => new Animated.Value(0))[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeFilter, setActiveFilter] = useState('Pending Review');

  const [activeItem, setActiveItem] = useState(null);
  const [imageUrls, setImageUrls] = useState({ idFront: '', idBack: '', faceScan: '' });
  const [imagesLoading, setImagesLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({ nameOnCard: '', licenseNumber: '', registrationDate: '', expirationDate: '', rejectionReason: '' });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await listVerificationsForAdmin();
      setItems(rows);
    } catch (error) {
      setLoadError(error?.message || 'Unable to load verification submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const navigateAdmin = (screen) => {
    if (currentUser) {
      navigation.navigate(screen, { user: currentUser });
      return;
    }
    navigation.navigate(screen);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      Animated.timing(menuAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMenuOpen(false));
      return;
    }
    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const filteredItems = activeFilter === 'All' ? items : items.filter((item) => item.status === activeFilter);

  const openReview = async (item) => {
    setActiveItem(item);
    setReviewError('');
    setReviewDraft({
      nameOnCard: item.prc_name_on_card || '',
      licenseNumber: item.prc_license_number || '',
      registrationDate: item.prc_registration_date || '',
      expirationDate: item.prc_expiration_date || '',
      rejectionReason: '',
    });
    setImageUrls({ idFront: '', idBack: '', faceScan: '' });
    setImagesLoading(true);
    try {
      const [idFront, idBack, faceScan] = await Promise.all([
        getVerificationSignedUrl(item.id_front_path),
        getVerificationSignedUrl(item.id_back_path),
        getVerificationSignedUrl(item.face_scan_path),
      ]);
      setImageUrls({ idFront, idBack, faceScan });
    } catch (error) {
      setReviewError(error?.message || 'Unable to load the uploaded images.');
    } finally {
      setImagesLoading(false);
    }
  };

  const closeReview = () => {
    if (reviewBusy) return;
    setActiveItem(null);
  };

  const handleApprove = async () => {
    if (!activeItem) return;
    setReviewError('');
    setReviewBusy(true);
    try {
      await approveVerification(activeItem.veterinarian_id, {
        reviewerId,
        prcNameOnCard: reviewDraft.nameOnCard,
        prcLicenseNumber: reviewDraft.licenseNumber,
        prcRegistrationDate: reviewDraft.registrationDate,
        prcExpirationDate: reviewDraft.expirationDate,
      });
      setActiveItem(null);
      await loadItems();
    } catch (error) {
      setReviewError(error?.message || 'Unable to approve this verification.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleReject = async () => {
    if (!activeItem) return;
    setReviewError('');
    setReviewBusy(true);
    try {
      await rejectVerification(activeItem.veterinarian_id, {
        reviewerId,
        rejectionReason: reviewDraft.rejectionReason,
      });
      setActiveItem(null);
      await loadItems();
    } catch (error) {
      setReviewError(error?.message || 'Unable to return this verification for resubmission.');
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateAdmin('admin-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
                <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Veterinarian Verification</Text></View>
              </TouchableOpacity>
              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateAdmin('AdminProfile')} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
              <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>Admin controls</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
            </View>
          </Animated.View>
          {menuOpen ? (
            <Animated.View style={[dashboardStyles.headerMenuPanel, { opacity: menuAnim, transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
              {HEADER_MENU_ITEMS.map((item, index) => (
                <TouchableOpacity key={item.key} style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]} onPress={() => { setMenuOpen(false); menuAnim.setValue(0); navigateAdmin(item.route); }} activeOpacity={0.88}>
                  <View style={dashboardStyles.headerMenuItemIconWrap}><Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
          <View style={dashboardStyles.sectionHeaderWrap}>
            <Text style={dashboardStyles.sectionTitle}>Veterinarian Verification</Text>
            <Text style={dashboardStyles.sectionSubtitle}>Review each veterinarian's PRC ID and live face photo, then approve or return the submission for resubmission. Only administrators can see this page.</Text>
          </View>

          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((filter) => (
              <TouchableOpacity key={filter} style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]} onPress={() => setActiveFilter(filter)} activeOpacity={0.88}>
                <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>{filter}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadError ? <View style={styles.noticeCard}><Text style={styles.noticeText}>{loadError}</Text></View> : null}
          {loading ? <Text style={styles.loadingText}>Loading submissions...</Text> : null}

          {!loading && !filteredItems.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No submissions here</Text>
              <Text style={styles.emptyText}>There are no verification submissions with this status right now.</Text>
            </View>
          ) : null}

          {filteredItems.map((item) => {
            const statusColors = getStatusColors(item.status);
            return (
              <TouchableOpacity key={item.id} style={styles.vetCard} onPress={() => openReview(item)} activeOpacity={0.9}>
                <View style={styles.vetTopRow}>
                  <View style={styles.vetIdentityWrap}>
                    <View style={styles.avatarCircle}><Image source={DEFAULT_PROFILE_IMAGE} style={styles.avatarImage} resizeMode="contain" /></View>
                    <View style={styles.vetTextWrap}>
                      <Text style={styles.vetName} numberOfLines={1}>{getVetName(item)}</Text>
                      <Text style={styles.vetSubline} numberOfLines={1}>{item.veterinarian?.email || 'No email on file'}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.vetMeta}>
                  {item.submitted_at ? `Submitted ${new Date(item.submitted_at).toLocaleString()}` : 'Not submitted yet'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Modal transparent animationType="fade" visible={Boolean(activeItem)} onRequestClose={closeReview}>
          <View style={styles.sheetOverlay}>
            <View style={styles.sheetBackdrop} />
            <View style={styles.reviewCard}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reviewScroll}>
                <Text style={styles.reviewTitle}>{getVetName(activeItem || {})}</Text>
                <Text style={styles.reviewSubtitle}>{activeItem?.veterinarian?.email}</Text>

                <Text style={styles.reviewSectionLabel}>PRC ID — Front</Text>
                {imagesLoading ? <Text style={styles.loadingText}>Loading...</Text> : imageUrls.idFront ? <Image source={{ uri: imageUrls.idFront }} style={styles.reviewImage} resizeMode="cover" /> : <View style={styles.reviewImagePlaceholder}><Text style={styles.reviewImagePlaceholderText}>No image</Text></View>}

                <Text style={styles.reviewSectionLabel}>PRC ID — Back</Text>
                {imagesLoading ? <Text style={styles.loadingText}>Loading...</Text> : imageUrls.idBack ? <Image source={{ uri: imageUrls.idBack }} style={styles.reviewImage} resizeMode="cover" /> : <View style={styles.reviewImagePlaceholder}><Text style={styles.reviewImagePlaceholderText}>No image</Text></View>}

                <Text style={styles.reviewSectionLabel}>Live Face Photo</Text>
                {imagesLoading ? <Text style={styles.loadingText}>Loading...</Text> : imageUrls.faceScan ? <Image source={{ uri: imageUrls.faceScan }} style={styles.reviewImage} resizeMode="cover" /> : <View style={styles.reviewImagePlaceholder}><Text style={styles.reviewImagePlaceholderText}>No image</Text></View>}

                <Text style={styles.reviewSectionLabel}>Extracted Information</Text>
                <Text style={styles.reviewFieldLabel}>Name on Card</Text>
                <TextInput value={reviewDraft.nameOnCard} onChangeText={(value) => setReviewDraft((current) => ({ ...current, nameOnCard: value }))} style={styles.reviewInput} placeholder="Name as printed on the PRC ID" placeholderTextColor="#87a0b1" />

                <Text style={styles.reviewFieldLabel}>License Number</Text>
                <TextInput value={reviewDraft.licenseNumber} onChangeText={(value) => setReviewDraft((current) => ({ ...current, licenseNumber: value }))} style={styles.reviewInput} placeholder="PRC license number" placeholderTextColor="#87a0b1" autoCapitalize="characters" />

                <Text style={styles.reviewFieldLabel}>Registration Date</Text>
                <TextInput value={reviewDraft.registrationDate} onChangeText={(value) => setReviewDraft((current) => ({ ...current, registrationDate: value }))} style={styles.reviewInput} placeholder="YYYY-MM-DD" placeholderTextColor="#87a0b1" />

                <Text style={styles.reviewFieldLabel}>Expiration Date</Text>
                <TextInput value={reviewDraft.expirationDate} onChangeText={(value) => setReviewDraft((current) => ({ ...current, expirationDate: value }))} style={styles.reviewInput} placeholder="YYYY-MM-DD" placeholderTextColor="#87a0b1" />

                <Text style={styles.reviewSectionLabel}>Return for Resubmission Reason</Text>
                <TextInput value={reviewDraft.rejectionReason} onChangeText={(value) => setReviewDraft((current) => ({ ...current, rejectionReason: value }))} style={[styles.reviewInput, styles.reviewInputMultiline]} placeholder="Explain what the veterinarian needs to fix (required to return)" placeholderTextColor="#87a0b1" multiline />

                {reviewError ? <Text style={styles.errorText}>{reviewError}</Text> : null}

                <View style={styles.reviewButtonRow}>
                  <TouchableOpacity style={styles.rejectButton} onPress={handleReject} activeOpacity={0.9} disabled={reviewBusy}>
                    <Text style={styles.rejectButtonText}>{reviewBusy ? 'Working...' : 'Return for Resubmission'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.approveButton} onPress={handleApprove} activeOpacity={0.9} disabled={reviewBusy}>
                    <Text style={styles.approveButtonText}>{reviewBusy ? 'Working...' : 'Approve'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.closeButton} onPress={closeReview} activeOpacity={0.9} disabled={reviewBusy}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 60 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f7fbfc', borderWidth: 1, borderColor: '#d7edf9', marginRight: 8, marginBottom: 8 },
  filterChipActive: { backgroundColor: '#447C99', borderColor: '#447C99' },
  filterChipText: { fontSize: 12, fontWeight: '800', color: '#5f7f8a' },
  filterChipTextActive: { color: '#ffffff' },

  noticeCard: { backgroundColor: '#fff1f1', borderRadius: 18, borderWidth: 1, borderColor: '#ffd7d7', padding: 14, marginBottom: 14 },
  noticeText: { fontSize: 13, fontWeight: '800', color: '#c24a4a' },
  loadingText: { fontSize: 13, fontWeight: '700', color: '#5f7f8a', marginBottom: 10 },
  errorText: { fontSize: 12, fontWeight: '700', color: '#dc2626', marginTop: 4, marginBottom: 10 },

  emptyCard: { backgroundColor: '#f4fbff', borderRadius: 24, borderWidth: 1, borderColor: '#d9ecf7', padding: 18, marginBottom: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 6 },
  emptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#648398' },

  vetCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  vetTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vetIdentityWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eef6fb', borderWidth: 1, borderColor: '#d5e7f2', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarImage: { width: 22, height: 22, tintColor: '#24566d' },
  vetTextWrap: { flex: 1 },
  vetName: { fontSize: 15, fontWeight: '900', color: '#24566d' },
  vetSubline: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#5f7f94' },
  vetMeta: { marginTop: 10, fontSize: 11, fontWeight: '700', color: '#7e97a6' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },

  sheetOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4, 17, 28, 0.55)' },
  reviewCard: { width: '100%', maxHeight: '86%', backgroundColor: '#fafdff', borderRadius: 26, borderWidth: 1, borderColor: '#d8eaf5', overflow: 'hidden' },
  reviewScroll: { padding: 20 },
  reviewTitle: { fontSize: 19, fontWeight: '900', color: '#24566d' },
  reviewSubtitle: { marginTop: 3, marginBottom: 14, fontSize: 12, fontWeight: '700', color: '#5f7f94' },
  reviewSectionLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  reviewImage: { width: '100%', height: 190, borderRadius: 16, backgroundColor: '#eef6fb' },
  reviewImagePlaceholder: { width: '100%', height: 120, borderRadius: 16, backgroundColor: '#eef6fb', borderWidth: 1, borderColor: '#d7edf9', alignItems: 'center', justifyContent: 'center' },
  reviewImagePlaceholderText: { fontSize: 12, fontWeight: '700', color: '#8aa2b4' },
  reviewFieldLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', marginBottom: 6, marginTop: 8 },
  reviewInput: { minHeight: 46, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7edf9', paddingHorizontal: 14, fontSize: 13, fontWeight: '700', color: '#24566d' },
  reviewInputMultiline: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  reviewButtonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  rejectButton: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#ffd7d7', alignItems: 'center', justifyContent: 'center' },
  rejectButtonText: { fontSize: 13, fontWeight: '900', color: '#c24a4a' },
  approveButton: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center' },
  approveButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  closeButton: { minHeight: 46, borderRadius: 16, backgroundColor: '#e7edf2', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  closeButtonText: { fontSize: 12, fontWeight: '900', color: '#4f6a7b' },
});

export default AdminVetVerification;
