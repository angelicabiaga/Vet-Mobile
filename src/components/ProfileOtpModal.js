import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const OTP_LENGTH = 6;
const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email || '').split('@');
  if (!domain) return 'your email';
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

// autoVerify: submit as soon as the 6th digit is entered (no Verify tap).
export default function ProfileOtpModal({ visible, purpose, destinationEmail, busy, error, onVerify, onResend, onCancel, onClearError, autoVerify = false }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [cooldown, setCooldown] = useState(60);
  const [notice, setNotice] = useState('');
  const refs = useRef([]);
  // The code last sent for checking, so the same entry is never submitted twice.
  const submittedRef = useRef('');

  useEffect(() => {
    if (!visible) return;
    setDigits(Array(OTP_LENGTH).fill(''));
    setCooldown(60);
    setNotice('');
    submittedRef.current = '';
    onClearError?.();
  }, [visible, purpose, destinationEmail]);

  useEffect(() => {
    if (!visible || cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible, cooldown]);

  const changeDigit = (value, index) => {
    if (!/^\d?$/.test(value)) return;
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
      setCooldown(60);
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
    if (busy || code.length !== OTP_LENGTH || submittedRef.current === code) return;
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
      <Text style={s.expiry}>The code expires in 10 minutes.</Text>
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <View style={s.otpRow}>{digits.map((digit, index) => <TextInput key={index} ref={(node) => { refs.current[index] = node; }} value={digit} onChangeText={(value) => changeDigit(value, index)} onKeyPress={(event) => keyPress(event, index)} keyboardType="number-pad" maxLength={1} autoFocus={index === 0} style={[s.otpBox, error && s.otpBoxError]} />)}</View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <TouchableOpacity style={[s.primary, (busy || code.length !== OTP_LENGTH) && s.disabled]} disabled={busy || code.length !== OTP_LENGTH} onPress={submit}>{busy ? <View style={s.busyRow}><ActivityIndicator color="#fff" size="small" /><Text style={s.primaryText}>Verifying...</Text></View> : <Text style={s.primaryText}>{emailChange ? 'Verify Email' : 'Verify Password Change'}</Text>}</TouchableOpacity>
      <TouchableOpacity disabled={busy || cooldown > 0} onPress={resend} style={s.linkButton}><Text style={[s.link, (busy || cooldown > 0) && s.linkDisabled]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend New Code'}</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy} onPress={cancel} style={[s.cancel, busy && s.disabled]}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
    </View></TouchableWithoutFeedback></ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({flex:{flex:1},overlay:{flex:1,backgroundColor:'rgba(10,25,35,.62)'},overlayContent:{flexGrow:1,justifyContent:'center',padding:22},card:{backgroundColor:'#fff',borderRadius:28,padding:22},back:{alignSelf:'flex-start',paddingVertical:4,marginBottom:4},backText:{color:'#2c6ba3',fontSize:16,fontWeight:'800'},title:{fontSize:23,fontWeight:'900',color:'#123a5e',textAlign:'center'},message:{fontSize:14,lineHeight:20,color:'#526d82',textAlign:'center',marginTop:12},email:{fontSize:15,fontWeight:'900',color:'#123a5e',textAlign:'center',marginTop:5},expiry:{fontSize:12,color:'#6a8aa0',textAlign:'center',marginTop:6,marginBottom:16},otpRow:{flexDirection:'row',justifyContent:'space-between',gap:6,marginBottom:18},otpBox:{flex:1,minWidth:38,maxWidth:52,height:56,borderWidth:1.5,borderColor:'#cfe2eb',borderRadius:13,backgroundColor:'#f9fcfd',textAlign:'center',fontSize:20,fontWeight:'900',color:'#123a5e'},otpBoxError:{borderColor:'#dc2626'},error:{color:'#dc2626',fontSize:12.5,fontWeight:'700',textAlign:'center',marginTop:-8,marginBottom:14},notice:{backgroundColor:'#d1fae5',color:'#065f46',padding:10,borderRadius:10,textAlign:'center',marginBottom:12},primary:{minHeight:52,borderRadius:15,backgroundColor:'#2c6ba3',alignItems:'center',justifyContent:'center'},disabled:{opacity:.48},busyRow:{flexDirection:'row',alignItems:'center',gap:8},primaryText:{color:'#fff',fontSize:14,fontWeight:'900'},linkButton:{paddingVertical:15},link:{color:'#2563eb',textAlign:'center',fontWeight:'800'},linkDisabled:{color:'#94a3b8'},cancel:{minHeight:48,borderRadius:15,borderWidth:1.5,borderColor:'#cfe2eb',alignItems:'center',justifyContent:'center'},cancelText:{color:'#475569',textAlign:'center',fontSize:15,fontWeight:'800'}});
