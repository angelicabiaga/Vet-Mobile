import React, { useMemo, useState } from "react";
import { Image, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { completePasswordReset } from "../../../api/authService";
import resetBg from "../../assets/reset.jpg";
import eyeShow from "../../assets/eye-show.png";
import eyeHide from "../../assets/eye-hide.png";

const Requirement = ({ met, children }) => <Text style={[styles.requirement, met && styles.requirementMet]}>{met ? "✓" : "×"} {children}</Text>;

const PasswordField = ({ label, value, onChangeText, visible, onToggle, placeholder }) => <View style={styles.field}>
  <Text style={styles.label}>{label}</Text>
  <View style={styles.passwordBox}>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8498a7" secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <TouchableOpacity onPress={onToggle} style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}>
      <Image source={visible ? eyeHide : eyeShow} style={styles.eyeIcon} resizeMode="contain" />
    </TouchableOpacity>
  </View>
</View>;

export default function ResetPasswordScreen({ navigation }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const rules = useMemo(() => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    matches: Boolean(confirm) && password === confirm,
  }), [password, confirm]);
  const canSubmit = Object.values(rules).every(Boolean) && !loading;

  const resetPassword = async () => {
    if (!canSubmit) return;
    setLoading(true); setError("");
    try {
      await completePasswordReset(password);
      navigation.replace("login", { passwordReset: true });
    } catch (err) {
      setError(err.message || "Unable to reset password.");
    } finally { setLoading(false); }
  };

  return <ImageBackground source={resetBg} style={styles.background} resizeMode="cover">
    <SafeAreaView style={styles.overlay}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.accent} />
            <Text style={styles.title}>Create New Password</Text>
            <Text style={styles.subtitle}>Your code was verified. Create a strong password for your account.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PasswordField label="New Password" value={password} onChangeText={(value) => { setPassword(value); setError(""); }} visible={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder="Enter new password" />
            <PasswordField label="Confirm New Password" value={confirm} onChangeText={(value) => { setConfirm(value); setError(""); }} visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} placeholder="Re-enter new password" />
            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Password must contain:</Text>
              <Requirement met={rules.length}>At least 8 characters</Requirement>
              <Requirement met={rules.upper}>One uppercase letter (A–Z)</Requirement>
              <Requirement met={rules.lower}>One lowercase letter (a–z)</Requirement>
              <Requirement met={rules.number}>One number (0–9)</Requirement>
              <Requirement met={rules.special}>One special character</Requirement>
              <Requirement met={rules.matches}>Passwords match</Requirement>
            </View>
            <TouchableOpacity onPress={resetPassword} disabled={!canSubmit} style={[styles.button, !canSubmit && styles.disabled]} activeOpacity={0.9}>
              <LinearGradient colors={["#1f6d8c", "#173f5c"]} style={styles.buttonGradient}><Text style={styles.buttonText}>{loading ? "Resetting..." : "Reset Password"}</Text></LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ImageBackground>;
}

const styles = StyleSheet.create({background:{flex:1},overlay:{flex:1,backgroundColor:"rgba(10,20,30,.35)"},flex:{flex:1},content:{flexGrow:1,justifyContent:"center",padding:20},card:{backgroundColor:"rgba(73,96,128,.88)",borderRadius:28,padding:24,borderWidth:1,borderColor:"rgba(255,255,255,.25)"},accent:{width:62,height:5,borderRadius:10,backgroundColor:"#9edcff",alignSelf:"center",marginBottom:16},title:{fontSize:28,fontWeight:"800",color:"#fff",textAlign:"center"},subtitle:{fontSize:14,lineHeight:20,color:"#d8e9f3",textAlign:"center",marginTop:8,marginBottom:20},field:{marginBottom:14},label:{fontSize:13,fontWeight:"800",color:"#fff",marginBottom:7},passwordBox:{position:"relative",justifyContent:"center"},input:{minHeight:54,borderRadius:15,backgroundColor:"rgba(255,255,255,.96)",borderWidth:1,borderColor:"#dce8ef",paddingHorizontal:15,paddingRight:52,color:"#173f5c",fontSize:15},eyeButton:{position:"absolute",right:10,width:38,height:46,alignItems:"center",justifyContent:"center"},eyeIcon:{width:23,height:23,tintColor:"#24566d"},requirements:{backgroundColor:"rgba(255,255,255,.10)",borderRadius:14,padding:13,marginBottom:16},requirementsTitle:{color:"#fff",fontWeight:"800",marginBottom:6},requirement:{color:"#ffd6d6",fontSize:12,lineHeight:20},requirementMet:{color:"#baf7d2"},error:{backgroundColor:"#fee2e2",color:"#991b1b",padding:11,borderRadius:11,textAlign:"center",marginBottom:14,fontWeight:"700"},button:{borderRadius:14,overflow:"hidden"},disabled:{opacity:.48},buttonGradient:{padding:16,alignItems:"center"},buttonText:{color:"#fff",fontSize:16,fontWeight:"800"}});
