import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CustomModal from '../../../components/CustomModal';
import ProfileOtpModal from '../../../components/ProfileOtpModal';
import VetShell, { getVetName, getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { confirmEmailChangeOtp, confirmPasswordChangeOtp, getProfile, requestEmailChangeOtp, requestPasswordChangeOtp, subscribeProfile, updateProfile, uploadProfileAvatar } from '../../../api/profileService';

const blank = { full_name: '', username: '', email: '', phone: '', address: '', avatar_url: '', currentPassword: '', newPassword: '', confirmPassword: '' };

const VetProfile = ({ navigation, route }) => {
  const routeUser = getVetUser(route);
  const profileId = routeUser?.id || routeUser?.user_id || routeUser?.profile_id || null;
  const [profile, setProfile] = React.useState({ ...blank, ...(routeUser || {}) });
  const [draft, setDraft] = React.useState(profile);
  const [editing, setEditing] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [otpPurpose, setOtpPurpose] = React.useState('');
  const [showOtp, setShowOtp] = React.useState(false);
  const [otpError, setOtpError] = React.useState('');
  const [pendingPassword, setPendingPassword] = React.useState('');
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const apply = React.useCallback((row) => {
    if (!row) return;
    const next = { ...blank, ...row };
    setProfile(next); setDraft(next);
    navigation.setParams({ user: { ...(routeUser || {}), ...row } });
  }, [navigation, routeUser]);

  React.useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    getProfile(profileId).then((row) => active && apply(row)).catch((error) => setMessage(error.message));
    const unsubscribe = subscribeProfile(profileId, (row) => active && apply(row));
    return () => { active = false; unsubscribe?.(); };
  }, [profileId]);

  const field = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const strongPassword = (value) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setMessage('Photo-library permission is required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 });
    if (!result.canceled && result.assets?.[0]?.uri) field('avatar_url', result.assets[0].uri);
  }

  async function save() {
    setMessage('');
    const emailChanged = draft.email.trim().toLowerCase() !== profile.email.trim().toLowerCase();
    const passwordChanged = Boolean(draft.newPassword);
    if (!draft.full_name.trim() || !draft.username.trim() || !draft.email.trim()) return setMessage('Full name, username, and email are required.');
    if (emailChanged && passwordChanged) return setMessage('Change your email and password separately, as each requires its own code.');
    if (emailChanged && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return setMessage('Enter a valid email address.');
    if (passwordChanged && (!strongPassword(draft.newPassword) || draft.newPassword !== draft.confirmPassword)) return setMessage('New password must meet all requirements and both passwords must match.');
    if ((emailChanged || passwordChanged) && !draft.currentPassword) return setMessage('Enter your current password to verify this change.');
    setBusy(true);
    try {
      let avatar = profile.avatar_url || null;
      if (draft.avatar_url && draft.avatar_url !== profile.avatar_url) avatar = await uploadProfileAvatar(profileId, draft.avatar_url);
      const updated = await updateProfile(profileId, { ...draft, avatar_url: avatar });
      if (emailChanged) {
        await requestEmailChangeOtp(profileId, draft.currentPassword, draft.email);
        setOtpPurpose('change_email'); setOtpError(''); setShowOtp(true); return;
      }
      if (passwordChanged) {
        await requestPasswordChangeOtp(profileId, draft.currentPassword);
        setPendingPassword(draft.newPassword); setOtpPurpose('change_password'); setOtpError(''); setShowOtp(true); return;
      }
      apply(updated); setEditing(false); setMessage('Profile updated successfully.');
    } catch (error) { setMessage(error.message || 'Unable to update profile.'); }
    finally { setBusy(false); }
  }

  async function verifyOtp(code) {
    setBusy(true); setMessage('');
    try {
      const result = otpPurpose === 'change_email'
        ? await confirmEmailChangeOtp(profileId, code)
        : await confirmPasswordChangeOtp(profileId, code, pendingPassword);
      const updated = result?.profile || await getProfile(profileId);
      apply(updated); setShowOtp(false); setEditing(false); setMessage(otpPurpose === 'change_email' ? 'Email changed and verified successfully.' : 'Password changed successfully.');
    } catch (error) { setOtpError(error.message || 'Invalid or expired verification code.'); }
    finally { setBusy(false); }
  }

  async function resendOtp() {
    setBusy(true); setOtpError('');
    try {
      if (otpPurpose === 'change_email') await requestEmailChangeOtp(profileId, draft.currentPassword, draft.email);
      else await requestPasswordChangeOtp(profileId, draft.currentPassword);
      return true;
    } catch (error) {
      setOtpError(error.message || 'Unable to resend verification code.');
      return false;
    } finally { setBusy(false); }
  }

  const avatar = editing ? draft.avatar_url : profile.avatar_url;
  return <VetShell navigation={navigation} route={route} subtitle="Veterinary Profile" caption="Account Settings" lowerHeaderAnimation={lowerHeaderAnimation}>
    <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
      <View style={styles.profileCard}>
        <TouchableOpacity style={styles.avatarWrap} onPress={editing ? pickAvatar : undefined} disabled={!editing}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Image source={require('../../assets/Profile.png')} style={styles.avatarIcon} resizeMode="contain" />}
        </TouchableOpacity>
        <Text style={styles.name}>{profile.full_name || getVetName(profile)}</Text><Text style={styles.role}>Veterinarian</Text>
        {editing ? <Text style={styles.photoHint}>Tap the photo to change it (maximum 5 MB)</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{editing ? 'Edit Profile' : 'Personal Information'}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {editing ? <>
          <Field label="Full name *" value={draft.full_name} onChangeText={(v) => field('full_name', v)} />
          <Field label="Username *" value={draft.username} onChangeText={(v) => field('username', v.toLowerCase())} autoCapitalize="none" />
          <Field label="Email *" value={draft.email} onChangeText={(v) => field('email', v)} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone number (Optional)" value={draft.phone || ''} onChangeText={(v) => field('phone', v)} keyboardType="phone-pad" />
          <Field label="Address (Optional)" value={draft.address || ''} onChangeText={(v) => field('address', v)} />
          <Text style={styles.title}>Change Password (Optional)</Text>
          <Field label="New password" value={draft.newPassword} onChangeText={(v) => field('newPassword', v)} secureTextEntry />
          <Field label="Confirm new password" value={draft.confirmPassword} onChangeText={(v) => field('confirmPassword', v)} secureTextEntry />
          <Text style={styles.hint}>Use at least 8 characters with uppercase, lowercase, number, and special character.</Text>
          {(draft.email.trim().toLowerCase() !== profile.email.trim().toLowerCase() || draft.newPassword) ? <Field label="Current password *" value={draft.currentPassword} onChangeText={(v) => field('currentPassword', v)} secureTextEntry /> : null}
          <View style={styles.row}><Button label={busy ? 'Saving...' : 'Save Profile'} onPress={save} disabled={busy} /><Button secondary label="Cancel" onPress={() => { setDraft(profile); setEditing(false); setMessage(''); }} /></View>
        </> : <>
          <Detail label="Username" value={profile.username} /><Detail label="Email" value={profile.email} /><Detail label="Phone" value={profile.phone || 'Not provided'} /><Detail label="Address" value={profile.address || 'Not provided'} />
          <Button label="Edit Profile" onPress={() => { setDraft(profile); setEditing(true); setMessage(''); }} />
          <Button secondary label="Logout" onPress={() => setShowLogoutModal(true)} />
        </>}
      </View>
    </ScrollView>
    <ProfileOtpModal visible={showOtp} purpose={otpPurpose} destinationEmail={otpPurpose === 'change_email' ? draft.email : profile.email} busy={busy} error={otpError} onClearError={() => setOtpError('')} onVerify={verifyOtp} onResend={resendOtp} onCancel={() => { if (!busy) { setShowOtp(false); setOtpError(''); } }} />
    <CustomModal show={showLogoutModal} onClose={() => setShowLogoutModal(false)} extraAction={<View style={styles.row}><Button label="Logout" onPress={() => { setShowLogoutModal(false); navigation.replace('login'); }} /><Button secondary label="Cancel" onPress={() => setShowLogoutModal(false)} /></View>}>Are you sure you want to logout?</CustomModal>
  </VetShell>;
};

const Field = ({ label, secureTextEntry, ...props }) => {
  const [visible, setVisible] = React.useState(false);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={secureTextEntry ? styles.passwordBox : null}><TextInput {...props} secureTextEntry={secureTextEntry && !visible} style={[styles.input, secureTextEntry && styles.passwordInput]} placeholderTextColor="#87a0b1" autoCorrect={secureTextEntry ? false : props.autoCorrect} />{secureTextEntry ? <TouchableOpacity onPress={() => setVisible((current) => !current)} style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}><Image source={visible ? require('../../assets/eye-hide.png') : require('../../assets/eye-show.png')} style={styles.eyeIcon} resizeMode="contain" /></TouchableOpacity> : null}</View></View>;
};
const Detail = ({ label, value }) => <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
const Button = ({ label, secondary, ...props }) => <TouchableOpacity {...props} style={[styles.button, secondary && styles.secondary, props.disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></TouchableOpacity>;

const styles = StyleSheet.create({
  scrollContent:{paddingHorizontal:18,paddingTop:8,paddingBottom:120},profileCard:{backgroundColor:'#fcfeff',borderRadius:26,borderWidth:1,borderColor:'#dceef8',padding:18,alignItems:'center',marginBottom:14},avatarWrap:{width:100,height:100,borderRadius:50,backgroundColor:'#e7f6f8',alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:'100%',height:'100%'},avatarIcon:{width:44,height:44,tintColor:'#24566d'},name:{fontSize:22,fontWeight:'900',color:'#24566d',marginTop:12,textAlign:'center'},role:{fontSize:12,fontWeight:'900',color:'#447C99',textTransform:'uppercase',marginTop:4},photoHint:{fontSize:12,color:'#6a8aa0',marginTop:8},card:{backgroundColor:'#fcfeff',borderRadius:26,borderWidth:1,borderColor:'#dceef8',padding:18},title:{fontSize:17,fontWeight:'900',color:'#24566d',marginBottom:12,marginTop:4},message:{padding:10,borderRadius:10,backgroundColor:'#eef7f8',color:'#24566d',marginBottom:12},field:{marginBottom:12},label:{fontSize:12,fontWeight:'800',color:'#526d82',marginBottom:6},input:{minHeight:46,borderWidth:1,borderColor:'#d5e6ee',borderRadius:12,paddingHorizontal:12,color:'#24566d',backgroundColor:'#fff'},passwordBox:{position:'relative',justifyContent:'center'},passwordInput:{paddingRight:48},eyeButton:{position:'absolute',right:10,width:34,height:42,alignItems:'center',justifyContent:'center'},eyeIcon:{width:22,height:22,tintColor:'#526d82'},hint:{fontSize:12,lineHeight:18,color:'#6a8aa0',marginBottom:12},detail:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#edf4f8'},detailLabel:{fontSize:11,fontWeight:'900',color:'#6a8aa0',textTransform:'uppercase'},detailValue:{fontSize:14,fontWeight:'800',color:'#24566d',marginTop:4},row:{flexDirection:'row',gap:10,marginTop:4},button:{minHeight:46,borderRadius:14,backgroundColor:'#447C99',alignItems:'center',justifyContent:'center',paddingHorizontal:18,marginTop:12,flex:1},secondary:{backgroundColor:'#edf4f8'},buttonText:{fontSize:13,fontWeight:'900',color:'#fff'},secondaryText:{color:'#24566d'},disabled:{opacity:.55}
});
export default VetProfile;
