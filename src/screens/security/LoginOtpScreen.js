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
  Keyboard,
  } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  verifyLoginOtp,
  completeRegistrationOtp,
  verifyPasswordResetOtp,
  resendAuthOtp,
  resetToDashboard,
  getPendingOtp,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_SECONDS,
} from "../../api/authService";
import otpBg from "../assets/reset.jpg";

const OTP_LENGTH = 6;
const EXPIRED_MESSAGE = "This code has expired. Please request a new code.";
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const LoginOtpScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { email, purpose = "login" } = route.params || {};

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Timestamps of the active code; the stored request overrides these on mount.
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const [resendAt, setResendAt] = useState(() => Date.now() + OTP_RESEND_SECONDS * 1000);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  const inputsRef = useRef([]);
  // Guards against duplicate verify requests (auto-submit + button tap, double taps).
  const isVerifyingRef = useRef(false);
  // The code last auto-submitted, so a rejected code is not resubmitted on its own.
  const lastAutoSubmittedRef = useRef("");

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = secondsLeft === 0;

  useEffect(() => {
    getPendingOtp()
      .then((pending) => {
        if (pending?.purpose !== purpose) return;
        setExpiresAt(Number(pending.expiresAt || 0));
        setResendAt(Number(pending.resendAvailableAt || 0));
      })
      .catch(() => {});
  }, [purpose]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The expired code can no longer be used: clear it and point the user to resend.
  useEffect(() => {
    if (!expired) return;
    setOtp(Array(OTP_LENGTH).fill(""));
    lastAutoSubmittedRef.current = "";
    setMessage("");
    setError(EXPIRED_MESSAGE);
    Keyboard.dismiss();
  }, [expired]);

  const handleChange = (value, index) => {
    if (isVerifyingRef.current || expired) return;
    const digits = String(value).replace(/\D/g, "");
    if (value && !digits) return;
    setError("");
    setMessage("");
    const newOtp = [...otp];
    let focusIndex = index;

    if (digits.length <= 1) {
      newOtp[index] = digits;
      if (digits && index < OTP_LENGTH - 1) focusIndex = index + 1;
    } else if (digits.length === 2 && otp[index]) {
      // Typed over a filled box: keep the new digit, not the old one.
      newOtp[index] = digits[0] === otp[index] ? digits[1] : digits[0];
      if (index < OTP_LENGTH - 1) focusIndex = index + 1;
    } else {
      // Pasted code: spread digits across the boxes starting here.
      const start = digits.length >= OTP_LENGTH ? 0 : index;
      digits.slice(0, OTP_LENGTH - start).split("").forEach((d, offset) => {
        newOtp[start + offset] = d;
      });
      focusIndex = Math.min(start + digits.length, OTP_LENGTH - 1);
    }

    setOtp(newOtp);

    const code = newOtp.join("");
    if (code.length !== OTP_LENGTH) {
      // A box was cleared; allow the next complete code to auto-verify again.
      lastAutoSubmittedRef.current = "";
      if (focusIndex !== index) inputsRef.current[focusIndex]?.focus();
      return;
    }

    if (code !== lastAutoSubmittedRef.current) {
      lastAutoSubmittedRef.current = code;
      Keyboard.dismiss();
      handleVerify(code);
    } else if (focusIndex !== index) {
      inputsRef.current[focusIndex]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  // Shared by the "Verify & Log In" button and auto-submit on the 6th digit.
  // `code` is passed by auto-submit because the `otp` state update is not applied yet.
  const handleVerify = async (code) => {
    if (isVerifyingRef.current) return;
    setError("");
    setMessage("");
    const otpValue = typeof code === "string" ? code : otp.join("");

    if (Date.now() >= expiresAt) {
      setError(EXPIRED_MESSAGE);
      return;
    }
    if (otpValue.length !== OTP_LENGTH) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    isVerifyingRef.current = true;
    Keyboard.dismiss();
    setLoading(true);
    try {
      if (purpose === "register") {
        await completeRegistrationOtp(otpValue);
        navigation.replace("login", { accountCreated: true });
        return;
      }
      if (purpose === "forgot_password") {
        await verifyPasswordResetOtp(otpValue);
        navigation.replace("reset-password");
        return;
      }

      const { user } = await verifyLoginOtp(email, otpValue, { rememberDevice });

      if (!resetToDashboard(navigation, { ...user, email: user?.email || email })) {
        setError("This app is available for Veterinarian and Pet Owner accounts only. Please sign in at the PawCruz web system.");
      }
    } catch (err) {
      setError(err.message || "Invalid OTP code.");
    } finally {
      isVerifyingRef.current = false;
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    try {
      setError("");
      setMessage("");
      const sent = await resendAuthOtp(purpose);
      setOtp(Array(OTP_LENGTH).fill(""));
      lastAutoSubmittedRef.current = "";
      setExpiresAt(sent.expiresAt);
      setResendAt(sent.resendAvailableAt);
      setNow(Date.now());
      setMessage("A new code has been sent. The previous code is no longer valid.");
      setTimeout(() => inputsRef.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
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
              <Text style={[styles.expiry, expired && styles.expiryExpired]}>
                {expired ? "This code has expired." : `This code expires in ${formatTime(secondsLeft)}.`}
              </Text>

              {message ? <Text style={styles.success}>{message}</Text> : null}

              <View style={styles.otpContainer}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    style={[styles.otpInput, error && styles.otpInputError]}
                    value={digit}
                    onChangeText={(val) => handleChange(val, i)}
                    keyboardType="number-pad"
                    // Above 1 so a pasted 6-digit code reaches handleChange intact.
                    maxLength={OTP_LENGTH}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    autoFocus={i === 0}
                    editable={!loading && !expired}
                    selectTextOnFocus
                  />
                ))}
              </View>
              {/* Code errors sit right under the boxes, which turn red. */}
              {error ? <Text style={styles.error}>{error}</Text> : null}

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
                style={[styles.button, (loading || expired || !otpComplete) && styles.disabledButton]}
                onPress={() => handleVerify()}
                disabled={loading || expired || !otpComplete}
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

                <TouchableOpacity onPress={resendOtp} disabled={cooldown > 0 || resending}>
                  <Text style={styles.helpText}>{expired ? "Need a new code?" : "Didn't get the code?"}</Text>
                  <Text
                    style={[
                      styles.resendLink,
                      (cooldown > 0 || resending) && styles.disabledResend,
                    ]}
                  >
                    {resending ? "Sending..." : "Resend New Code"}
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

  expiryExpired: {
    color: "#fecaca",
    fontWeight: "700",
  },

  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
  },

  otpInputError: {
    borderColor: "#EF4444",
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
