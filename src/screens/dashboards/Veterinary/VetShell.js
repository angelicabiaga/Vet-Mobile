import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { Animated, Image, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/VetDashboardDesign';
import { getNotifications, subscribeNotifications } from '../../../api/notificationService';
import useResolvedSessionUser from '../../../hooks/useResolvedSessionUser';
import PetOwnerHeaderGreeting from '../PetOwner/PetOwnerHeaderGreeting';
import VetBottomNav from './VetBottomNav';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

// Which bottom-bar tab a Vet screen belongs to (sub-screens highlight their parent tab).
const getActiveTabKey = (routeName) => {
  if (routeName === 'vet-screen') return 'dashboard';
  if (routeName === 'VetMessages') return 'messages';
  if (routeName === 'VetAppointment') return 'appointments';
  if (routeName === 'VetSchedule') return 'schedule';
  if (
    routeName === 'VetPatientOwners' ||
    routeName === 'VetPatients' ||
    routeName === 'VetPatientProfile' ||
    routeName === 'VetMedRec'
  ) return 'patients';
  return undefined;
};

export const getVetName = (user) => user?.full_name || user?.fullName || user?.name || user?.username || 'Veterinarian';
export const getVetUser = (route) => route?.params?.user || route?.params || null;

const VetShell = ({ navigation, route, subtitle, caption, children, showBack = false, lowerHeaderScrollY, lowerHeaderAnimation }) => {
  const currentUser = useResolvedSessionUser(getVetUser(route));
  const profileImageUri = currentUser?.avatar_url || currentUser?.profileImageUri || currentUser?.avatar || '';
  const [unreadCount, setUnreadCount] = React.useState(0);
  const profileId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || null;

  const refreshUnread = React.useCallback(async () => {
    if (!profileId) {
      setUnreadCount(0);
      return;
    }
    try {
      const rows = await getNotifications(profileId);
      setUnreadCount((rows || []).filter((item) => !item.is_read).length);
    } catch (error) {
      console.warn('Unable to refresh Vet notification badge:', error?.message || error);
    }
  }, [profileId]);

  React.useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    refreshUnread();
    const unsubscribe = subscribeNotifications(profileId, {
      onChange: () => { if (active) refreshUnread(); },
    });
    const timer = setInterval(() => { if (active) refreshUnread(); }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [profileId, refreshUnread]);

  const lowerHeaderTranslateY = lowerHeaderScrollY
    ? lowerHeaderScrollY.interpolate({ inputRange: [0, 72], outputRange: [0, -72], extrapolate: 'clamp' })
    : 0;
  const lowerHeaderAnimatedStyle = lowerHeaderAnimation
    ? {
        maxHeight: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
        opacity: lowerHeaderAnimation,
        transform: [
          {
            translateY: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
          },
        ],
      }
    : lowerHeaderScrollY
      ? { transform: [{ translateY: lowerHeaderTranslateY }] }
      : null;

  const navigateVet = (screen) => {
    navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={dashboardStyles.background}>
      <SafeAreaView style={dashboardStyles.container}>
        <LinearGradient
          colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dashboardStyles.headerBar}
        >
          <LinearGradient
            colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dashboardStyles.headerTopBand}
          >
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateVet('vet-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" />
                </View>
                <View style={dashboardStyles.brandBlock}>
                  <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                  <Text style={dashboardStyles.headerSubtitle}>{subtitle}</Text>
                </View>
              </TouchableOpacity>

              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateVet('VetNotif')} activeOpacity={0.85}>
                  {unreadCount > 0 ? <View style={dashboardStyles.notifBadge} /> : null}
                  <Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateVet('VetProfile')} activeOpacity={0.85}>
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" />
                  ) : (
                    <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              {showBack ? (
                <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                  <Image source={require('../../assets/Back_Icon.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
                </TouchableOpacity>
              ) : null}
              {/* No divider line beside the back button, same as Quick Assist. */}
              <PetOwnerHeaderGreeting caption={caption} name={getVetName(currentUser)} accent={!showBack} />
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Fills the space between header and bar so the bar stays at the bottom
            even for short content (loading / empty states). */}
        <View style={{ flex: 1 }}>{children}</View>

        <VetBottomNav navigation={navigation} user={currentUser} activeKey={getActiveTabKey(route?.name)} />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default VetShell;
