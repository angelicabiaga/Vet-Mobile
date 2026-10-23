import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const OTP_LENGTH = 6;
// Match the 10-minute expiry and 60-second resend cooldown enforced when the code is checked.
const EXPIRY_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const EXPIRED_MESSAGE = 'This code has expired. Please request a new code.';
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email || '').split('@');
  if (!domain) return 'your email';
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

// autoVerify: submit as soon as the 6th digit is entered (no Verify tap).
export default function ProfileOtpModal({ visible, purpose, destinationEmail, busy, error, onVerify, onResend, onCancel, onClearError, autoVerify = false }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + EXPIRY_MS);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_MS);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const refs = useRef([]);
  // The code last sent for checking, so the same entry is never submitted twice.
  const submittedRef = useRef('');

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = visible && secondsLeft === 0;

  const startTimers = () => {
    const sentAt = Date.now();
    setExpiresAt(sentAt + EXPIRY_MS);
    setResendAt(sentAt + RESEND_MS);
    setNow(sentAt);
  };

  useEffect(() => {
    // Also reset on hide, so reopening never starts from a previous expired code.
    startTimers();
    if (!visible) return;
    setDigits(Array(OTP_LENGTH).fill(''));
    setNotice('');
    submittedRef.current = '';
    onClearError?.();
  }, [visible, purpose, destinationEmail]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  // The expired code can no longer be used: clear it and point the user to resend.
  useEffect(() => {
    if (!expired) return;
    setDigits(Array(OTP_LENGTH).fill(''));
    submittedRef.current = '';
    setNotice('');
    Keyboard.dismiss();
  }, [expired]);

  const changeDigit = (value, index) => {
    if (expired || !/^\d?$/.test(value)) return;
    setNotice('');
    submittedRef.current = '';
    const next = [...digits]; next[index] = value; setDigits(next);
    if (value && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  };
  const keyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  };
  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setNotice('');
    const ok = await onResend?.();
    if (ok !== false) {
      setDigits(Array(OTP_LENGTH).fill(''));
      submittedRef.current = '';
      startTimers();
      setNotice('A new verification code has been sent. The previous code is no longer valid.');
      setTimeout(() => refs.current[0]?.focus(), 100);
    }
  };
  const code = digits.join('');
  const emailChange = purpose === 'change_email';
  const title = emailChange ? 'Verify Email Change' : 'Verify Password Change';
  // Both codes go to the current registered email.
  const destinationLabel = 'registered email';

  const submit = () => {
    if (busy || expired || code.length !== OTP_LENGTH || submittedRef.current === code) return;
    submittedRef.current = code;
    onVerify?.(code);
  };

  useEffect(() => {
    if (visible && autoVerify && code.length === OTP_LENGTH) submit();
  }, [visible, autoVerify, code]);

  const cancel = () => {
    if (busy) return;
    Keyboard.dismiss();
    onCancel?.();
  };

  // The keyboard opens on show (autoFocus), so the card sits in a keyboard-avoiding
  // scroll view and a tap outside the code boxes closes the keyboard.
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={cancel}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={s.overlay} contentContainerStyle={s.overlayContent} keyboardShouldPersistTaps="handled"><TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}><View style={s.card}>
      <TouchableOpacity disabled={busy} onPress={cancel} style={s.back} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={[s.backText, busy && s.linkDisabled]}>‹ Back</Text></TouchableOpacity>
      <Text style={s.title}>{title}</Text>
      <Text style={s.message}>Enter the 6-digit code sent to your {destinationLabel}:</Text>
      <Text style={s.email}>{maskEmail(destinationEmail)}</Text>
      <Text style={[s.expiry, expired && s.expiryExpired]}>{expired ? 'This code has expired.' : `The code expires in ${formatTime(secondsLeft)}.`}</Text>
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <View style={s.otpRow}>{digits.map((digit, index) => <TextInput key={index} ref={(node) => { refs.current[index] = node; }} value={digit} onChangeText={(value) => changeDigit(value, index)} onKeyPress={(event) => keyPress(event, index)} keyboardType="number-pad" maxLength={1} autoFocus={index === 0} editable={!expired} style={[s.otpBox, (error || expired) && s.otpBoxError]} />)}</View>
      {expired ? <Text style={s.error}>{EXPIRED_MESSAGE}</Text> : error ? <Text style={s.error}>{error}</Text> : null}
      <TouchableOpacity style={[s.primary, (busy || expired || code.length !== OTP_LENGTH) && s.disabled]} disabled={busy || expired || code.length !== OTP_LENGTH} onPress={submit}>{busy ? <View style={s.busyRow}><ActivityIndicator color="#fff" size="small" /><Text style={s.primaryText}>Verifying...</Text></View> : <Text style={s.primaryText}>{emailChange ? 'Verify Email' : 'Verify Password Change'}</Text>}</TouchableOpacity>
      <TouchableOpacity disabled={busy || cooldown > 0} onPress={resend} style={s.linkButton}><Text style={[s.link, (busy || cooldown > 0) && s.linkDisabled]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend New Code'}</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy} onPress={cancel} style={[s.cancel, busy && s.disabled]}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
    </View></TouchableWithoutFeedback></ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({flex:{flex:1},overlay:{flex:1,backgroundColor:'rgba(10,25,35,.62)'},overlayContent:{flexGrow:1,justifyContent:'center',padding:22},card:{backgroundColor:'#fff',borderRadius:28,padding:22},back:{alignSelf:'flex-start',paddingVertical:4,marginBottom:4},backText:{color:'#2c6ba3',fontSize:16,fontWeight:'800'},title:{fontSize:23,fontWeight:'900',color:'#123a5e',textAlign:'center'},message:{fontSize:14,lineHeight:20,color:'#526d82',textAlign:'center',marginTop:12},email:{fontSize:15,fontWeight:'900',color:'#123a5e',textAlign:'center',marginTop:5},expiry:{fontSize:12,color:'#6a8aa0',textAlign:'center',marginTop:6,marginBottom:16},expiryExpired:{color:'#dc2626',fontWeight:'800'},otpRow:{flexDirection:'row',justifyContent:'space-between',gap:6,marginBottom:18},otpBox:{flex:1,minWidth:38,maxWidth:52,height:56,borderWidth:1.5,borderColor:'#cfe2eb',borderRadius:13,backgroundColor:'#f9fcfd',textAlign:'center',fontSize:20,fontWeight:'900',color:'#123a5e'},otpBoxError:{borderColor:'#dc2626'},error:{color:'#dc2626',fontSize:12.5,fontWeight:'700',textAlign:'center',marginTop:-8,marginBottom:14},notice:{backgroundColor:'#d1fae5',color:'#065f46',padding:10,borderRadius:10,textAlign:'center',marginBottom:12},primary:{minHeight:52,borderRadius:15,backgroundColor:'#2c6ba3',alignItems:'center',justifyContent:'center'},disabled:{opacity:.48},busyRow:{flexDirection:'row',alignItems:'center',gap:8},primaryText:{color:'#fff',fontSize:14,fontWeight:'900'},linkButton:{paddingVertical:15},link:{color:'#2563eb',textAlign:'center',fontWeight:'800'},linkDisabled:{color:'#94a3b8'},cancel:{minHeight:48,borderRadius:15,borderWidth:1.5,borderColor:'#cfe2eb',alignItems:'center',justifyContent:'center'},cancelText:{color:'#475569',textAlign:'center',fontSize:15,fontWeight:'800'}});
