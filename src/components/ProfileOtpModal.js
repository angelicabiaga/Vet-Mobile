import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const OTP_LENGTH = 6;
const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email || '').split('@');
  if (!domain) return 'your email';
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

export default function ProfileOtpModal({ visible, purpose, destinationEmail, busy, error, onVerify, onResend, onCancel, onClearError }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [cooldown, setCooldown] = useState(60);
  const [notice, setNotice] = useState('');
  const refs = useRef([]);

  useEffect(() => {
    if (!visible) return;
    setDigits(Array(OTP_LENGTH).fill(''));
    setCooldown(60);
    setNotice('');
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
  const destinationLabel = emailChange ? 'new email address' : 'registered email';

  return <Modal transparent animationType="fade" visible={visible} onRequestClose={() => !busy && onCancel?.()}>
    <View style={s.overlay}><View style={s.card}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.message}>Enter the 6-digit code sent to your {destinationLabel}:</Text>
      <Text style={s.email}>{maskEmail(destinationEmail)}</Text>
      <Text style={s.expiry}>The code expires in 10 minutes.</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <View style={s.otpRow}>{digits.map((digit, index) => <TextInput key={index} ref={(node) => { refs.current[index] = node; }} value={digit} onChangeText={(value) => changeDigit(value, index)} onKeyPress={(event) => keyPress(event, index)} keyboardType="number-pad" maxLength={1} autoFocus={index === 0} style={s.otpBox} />)}</View>
      <TouchableOpacity style={[s.primary, (busy || code.length !== OTP_LENGTH) && s.disabled]} disabled={busy || code.length !== OTP_LENGTH} onPress={() => onVerify?.(code)}><Text style={s.primaryText}>{busy ? 'Verifying...' : emailChange ? 'Verify Email' : 'Verify Password Change'}</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy || cooldown > 0} onPress={resend} style={s.linkButton}><Text style={[s.link, (busy || cooldown > 0) && s.linkDisabled]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend New Code'}</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy} onPress={onCancel} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}

const s = StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(10,25,35,.62)',justifyContent:'center',padding:22},card:{backgroundColor:'#fff',borderRadius:28,padding:22},title:{fontSize:23,fontWeight:'900',color:'#24566d',textAlign:'center'},message:{fontSize:14,lineHeight:20,color:'#526d82',textAlign:'center',marginTop:12},email:{fontSize:15,fontWeight:'900',color:'#24566d',textAlign:'center',marginTop:5},expiry:{fontSize:12,color:'#6a8aa0',textAlign:'center',marginTop:6,marginBottom:16},otpRow:{flexDirection:'row',justifyContent:'space-between',gap:6,marginBottom:18},otpBox:{flex:1,minWidth:38,maxWidth:52,height:56,borderWidth:1.5,borderColor:'#cfe2eb',borderRadius:13,backgroundColor:'#f9fcfd',textAlign:'center',fontSize:20,fontWeight:'900',color:'#24566d'},error:{backgroundColor:'#fee2e2',color:'#991b1b',padding:10,borderRadius:10,textAlign:'center',marginBottom:12},notice:{backgroundColor:'#d1fae5',color:'#065f46',padding:10,borderRadius:10,textAlign:'center',marginBottom:12},primary:{minHeight:52,borderRadius:15,backgroundColor:'#447C99',alignItems:'center',justifyContent:'center'},disabled:{opacity:.48},primaryText:{color:'#fff',fontSize:14,fontWeight:'900'},linkButton:{paddingVertical:15},link:{color:'#2563eb',textAlign:'center',fontWeight:'800'},linkDisabled:{color:'#94a3b8'},cancel:{paddingVertical:8},cancelText:{color:'#64748b',textAlign:'center',fontSize:15}});
