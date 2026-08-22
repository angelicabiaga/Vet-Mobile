import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
  } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  verifyLoginOtp,
  completeRegistrationOtp,
  verifyPasswordResetOtp,
  resendAuthOtp,
} from "../../api/authService";
import otpBg from "../assets/reset.jpg";

const OTP_LENGTH = 6;

const LoginOtpScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { email, purpose = "login" } = route.params || {};

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  const inputsRef = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;
    setError("");
    setMessage("");
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setError("");
    setMessage("");
    const otpValue = otp.join("");

    if (otpValue.length !== OTP_LENGTH) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      if (purpose === "register") {
        await completeRegistrationOtp(otpValue);
        navigation.replace("login");
        return;
      }
      if (purpose === "forgot_password") {
        await verifyPasswordResetOtp(otpValue);
        navigation.replace("reset-password");
        return;
      }

      const { user } = await verifyLoginOtp(email, otpValue, { rememberDevice });

      const role = user.role;
      if (role === "veterinarian") {
        navigation.replace("vet-screen", {
          user: { ...user, email: user?.email || email },
        });
      }
      else if (role === "pet_owner") {
        navigation.replace("petowner-screen", {
          user: { ...user, email: user?.email || email },
        });
      }
      else {
        setError("This app is available for Veterinarian and Pet Owner accounts only. Please sign in at the PawCruz web system.");
      }
    } catch (err) {
      setError(err.message || "Invalid OTP code.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;

    try {
      setError("");
      setMessage("");
      await resendAuthOtp(purpose);
      setOtp(Array(OTP_LENGTH).fill(""));
      setMessage("A new code has been sent.");
      setCooldown(60);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    }
  };

  const maskedEmail = (() => {
    const [name = "", domain = ""] = String(email || "").split("@");
    if (!domain) return email || "your registered email";
    const visible = name.slice(0, Math.min(3, name.length));
    return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
  })();
  const otpComplete = otp.every(Boolean);

  return (
    <ImageBackground
      source={otpBg}
      style={styles.background}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.topAccent} />

              <Text style={styles.title}>OTP Verification</Text>
              <Text style={styles.subtitle}>Enter the 6-digit code sent to:</Text>
              <Text style={styles.email}>{maskedEmail}</Text>
              <Text style={styles.expiry}>This code expires in 10 minutes.</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {message ? <Text style={styles.success}>{message}</Text> : null}

              <View style={styles.otpContainer}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    style={styles.otpInput}
                    value={digit}
                    onChangeText={(val) => handleChange(val, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    autoFocus={i === 0}
                  />
                ))}
              </View>

              {purpose === "login" ? (
                <TouchableOpacity
                  style={styles.rememberRow}
                  onPress={() => setRememberDevice((current) => !current)}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberDevice }}
                >
                  <View style={[styles.checkbox, rememberDevice && styles.checkboxChecked]}>
                    {rememberDevice ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View style={styles.rememberTextWrap}>
                    <Text style={styles.rememberTitle}>Don’t ask again on this device for 30 days</Text>
                    <Text style={styles.rememberNote}>Leave unchecked to require OTP again on your next login.</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.button, (loading || !otpComplete) && styles.disabledButton]}
                onPress={handleVerify}
                disabled={loading || !otpComplete}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={["#1f6d8c", "#173f5c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Verifying..." : purpose === "login" ? "Verify & Log In" : purpose === "register" ? "Verify Registration" : "Verify Code"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : ""}
                </Text>

                <TouchableOpacity onPress={resendOtp} disabled={cooldown > 0}>
                  <Text style={styles.helpText}>Didn't get the code?</Text>
                  <Text
                    style={[
                      styles.resendLink,
                      cooldown > 0 && styles.disabledResend,
                    ]}
                  >
                    Resend New Code
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default LoginOtpScreen;

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  bgImage: {
    width: "100%",
    height: "100%",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 30, 0.35)",
  },

  container: {
    flex: 1,
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(73, 96, 128, 0.66)",
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },

  topAccent: {
    width: 62,
    height: 5,
    borderRadius: 10,
    backgroundColor: "#9edcff",
    alignSelf: "center",
    marginBottom: 16,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 14,
    color: "#d8e9f3",
    marginTop: 8,
    textAlign: "center",
  },

  email: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
    marginBottom: 20,
    marginTop: 4,
    textAlign: "center",
  },

  expiry: {
    color: "#d8e9f3",
    fontSize: 12,
    marginTop: -14,
    marginBottom: 18,
  },

  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
  },

  otpInput: {
    width: 46,
    height: 58,
    marginHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#d1dce8",
    borderRadius: 14,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#173f5c",
    backgroundColor: "rgba(255,255,255,0.96)",
  },

  rememberRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d8e9f3",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },

  checkboxChecked: { backgroundColor: "#1f6d8c", borderColor: "#9edcff" },
  checkmark: { color: "#ffffff", fontSize: 15, fontWeight: "900", lineHeight: 17 },
  rememberTextWrap: { flex: 1 },
  rememberTitle: { color: "#ffffff", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  rememberNote: { color: "#d8e9f3", fontSize: 11, lineHeight: 16, marginTop: 3 },

  button: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 18,
  },

  disabledButton: {
    opacity: 0.75,
  },

  buttonGradient: {
    width: "100%",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },

  resendContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  resendText: {
    color: "#e4edf5",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
  },

  helpText: {
    fontSize: 14,
    color: "#d8e9f3",
    textAlign: "center",
    marginBottom: 2,
  },

  resendLink: {
    color: "#9edcff",
    fontWeight: "800",
    textDecorationLine: "underline",
    textAlign: "center",
  },

  disabledResend: {
    color: "#b9c7d4",
  },

  error: {
    color: "#991b1b",
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    width: "100%",
    textAlign: "center",
    marginBottom: 12,
  },

  success: {
    color: "#065f46",
    backgroundColor: "#d1fae5",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    width: "100%",
    textAlign: "center",
    marginBottom: 12,
  },
});
