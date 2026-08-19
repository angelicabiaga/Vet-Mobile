import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { registerUser } from "../api/authService";
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from "../utils/contactValidation";

import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';

import CustomModal from "../components/CustomModal";

const { width, height } = Dimensions.get("window");

const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contact: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const [modal, setModal] = useState({
    visible: false,
    message: ""
  });

  const handleChange = (name, value) => {
    let nextValue = value;
    if (name === "middleName") nextValue = value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, "");
    else if (name === "contact") nextValue = value.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "");
    const nextForm = { ...formData, [name]: nextValue };
    setFormData(nextForm);

    if (touched[name] || errors[name]) {
      setErrors(validateForm(nextForm));
    }
  };

  const passwordChecks = (password) => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  });

  const validateForm = (data) => {
    const nextErrors = {};

    if (!data.firstName.trim()) nextErrors.firstName = "First name is required.";
    else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,}$/.test(data.firstName.trim())) nextErrors.firstName = "Enter a valid first name.";

    if (!data.lastName.trim()) nextErrors.lastName = "Last name is required.";
    else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,}$/.test(data.lastName.trim())) nextErrors.lastName = "Enter a valid last name.";

    if (!data.contact.trim()) nextErrors.contact = "Contact number is required.";
    else if (!isValidPhMobile(data.contact)) nextErrors.contact = PH_MOBILE_FORMAT_ERROR;

    if (!data.username.trim()) nextErrors.username = "Username is required.";
    else if (!/^[A-Za-z0-9_.-]{3,30}$/.test(data.username.trim())) nextErrors.username = "Use 3–30 letters, numbers, dots, dashes, or underscores.";

    if (!data.email.trim()) nextErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) nextErrors.email = "Enter a valid email address.";

    if (!data.password) nextErrors.password = "Password is required.";
    else if (Object.values(passwordChecks(data.password)).some((passed) => !passed)) nextErrors.password = "Password does not meet all requirements.";

    if (!data.confirmPassword) nextErrors.confirmPassword = "Confirm password is required.";
    else if (data.password !== data.confirmPassword) nextErrors.confirmPassword = "Passwords do not match.";

    return nextErrors;
  };

  const handleBlur = (name) => {
    setTouched((current) => ({ ...current, [name]: true }));
    setErrors(validateForm(formData));
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm(formData);
    setTouched(Object.keys(formData).reduce((all, key) => ({ ...all, [key]: true }), {}));
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length) {
      return;
    }

    try {
      setLoading(true);

      const result = await registerUser(formData);
      if (result.requiresOtp) {
        navigation.navigate("otp", { email: result.email, purpose: "register" });
      }
    } catch (err) {
      setModal({
        visible: true,
        message: err.message || "Registration failed"
      });
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModal({ visible: false, message: "" });
  };

  return (
    <View style={styles.container}>
      {/* FULL SCREEN BACKGROUND IMAGE */}
      <View style={styles.backgroundImageContainer}>
        <Image
          source={require('./assets/reset.jpg')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>

      {/* OVERLAY */}
      <LinearGradient
        colors={[
          'rgba(7, 18, 28, 0.45)',
          'rgba(11, 30, 46, 0.35)',
          'rgba(24, 48, 66, 0.55)'
        ]}
        style={styles.overlay}
      />

      {/* CONTENT */}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.innerContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('./assets/paw1.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandText}>PawCruz</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.topAccent} />

              <Text style={styles.titleLarge}>Create Account</Text>
              <Text style={styles.registerSubText}>
                Join our pet care platform and create your account to get started.
              </Text>

              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                placeholder="First name"
                placeholderTextColor="#8d98a5"
                value={formData.firstName}
                onChangeText={(v) => handleChange("firstName", v)}
                onBlur={() => handleBlur("firstName")}
              />
              {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}

              <Text style={styles.label}>Middle Name <Text style={styles.optionalText}>(Optional)</Text></Text>
              <TextInput
                style={[styles.input, errors.middleName && styles.inputError]}
                placeholder="Middle name"
                placeholderTextColor="#8d98a5"
                value={formData.middleName}
                onChangeText={(v) => handleChange("middleName", v)}
                onBlur={() => handleBlur("middleName")}
              />
              {errors.middleName ? <Text style={styles.errorText}>{errors.middleName}</Text> : null}

              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                placeholder="Last name"
                placeholderTextColor="#8d98a5"
                value={formData.lastName}
                onChangeText={(v) => handleChange("lastName", v)}
                onBlur={() => handleBlur("lastName")}
              />
              {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}

              <Text style={styles.label}>Contact Number</Text>
              <TextInput
                style={[styles.input, errors.contact && styles.inputError]}
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                placeholderTextColor="#8d98a5"
                value={formData.contact}
                onChangeText={(v) => handleChange("contact", v)}
                onBlur={() => handleBlur("contact")}
                keyboardType="phone-pad"
                maxLength={13}
              />
              {errors.contact ? <Text style={styles.errorText}>{errors.contact}</Text> : null}

              <Text style={styles.label}>Username</Text>
              <TextInput
                style={[styles.input, errors.username && styles.inputError]}
                placeholder="Enter username"
                placeholderTextColor="#8d98a5"
                value={formData.username}
                onChangeText={(v) => handleChange("username", v)}
                onBlur={() => handleBlur("username")}
                autoCapitalize="none"
              />
              {errors.username ? <Text style={styles.errorText}>{errors.username}</Text> : null}

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="name@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#8d98a5"
                value={formData.email}
                onChangeText={(v) => handleChange("email", v)}
                onBlur={() => handleBlur("email")}
              />
              {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="••••••••"
                secureTextEntry={!showPass}
                placeholderTextColor="#8d98a5"
                value={formData.password}
                onChangeText={(v) => handleChange("password", v)}
                onBlur={() => handleBlur("password")}
              />
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
              <View style={styles.passwordRequirements}>
                <Text style={styles.passwordRequirementsTitle}>Password must contain:</Text>
                {[
                  ["length", "At least 8 characters"],
                  ["uppercase", "At least one uppercase letter (A-Z)"],
                  ["lowercase", "At least one lowercase letter (a-z)"],
                  ["number", "At least one number (0-9)"],
                  ["special", "At least one special character (!@#$%^&*...)"],
                ].map(([key, label]) => {
                  const passed = passwordChecks(formData.password)[key];
                  return <Text key={key} style={[styles.requirementText, passed && styles.requirementPassed]}>{passed ? "✓" : "×"} {label}</Text>;
                })}
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={[styles.input, errors.confirmPassword && styles.inputError]}
                placeholder="••••••••"
                secureTextEntry={!showConfirm}
                placeholderTextColor="#8d98a5"
                value={formData.confirmPassword}
                onChangeText={(v) => handleChange("confirmPassword", v)}
                onBlur={() => handleBlur("confirmPassword")}
              />
              {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}

              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.9}
                onPress={handleSubmit}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#1f6d8c', '#173f5c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Processing..." : "Sign Up"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('login')}>
                <Text style={styles.footerText}>
                  Already a member? <Text style={styles.loginLink}>Log In</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <CustomModal show={modal.visible} onClose={closeModal}>
              <Text>{modal.message}</Text>
            </CustomModal>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08131d',
    position: 'relative',
  },

  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    zIndex: 3,
  },

  backgroundImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 0,
    overflow: 'hidden',
  },

  backgroundImage: {
    width: width,
    height: height,
    position: 'absolute',
    top: 0,
    left: 0,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 1,
  },

  innerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
    zIndex: 3,
  },

  headerContainer: {
    alignItems: 'center',
    marginBottom: 22,
  },

  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  logo: {
    width: 38,
    height: 38,
  },

  brandText: {
    fontSize: 30,
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  card: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: 'rgba(73, 96, 128, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.22,
        shadowRadius: 22,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 16px 42px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(14px)',
      }
    }),
  },

  topAccent: {
    width: 72,
    height: 5,
    borderRadius: 10,
    backgroundColor: '#9edcff',
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.9,
  },

  titleLarge: {
    fontSize: 29,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },

  registerSubText: {
    fontSize: 14,
    color: '#d8e9f3',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 21,
    paddingHorizontal: 6,
  },

  label: {
    color: '#f4fbff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  pickerContainer: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    marginBottom: 16,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dce8ef',
  },

  dropdown: {
    height: 54,
    paddingHorizontal: 16,
  },

  dropdownContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  dropdownPlaceholder: {
    color: '#8393a1',
    fontSize: 15,
  },

  dropdownSelectedText: {
    color: '#173f5c',
    fontSize: 15,
    fontWeight: '600',
  },

  dropdownItemText: {
    color: '#173f5c',
    fontSize: 15,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 18,
    marginBottom: 8,
    fontSize: 15,
    color: '#243746',
    borderWidth: 1,
    borderColor: '#dce8ef',
  },

  inputError: {
    borderColor: '#dc2626',
    borderWidth: 1.5,
  },

  errorText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 12,
    marginLeft: 4,
  },

  optionalText: {
    color: '#d8e9f3',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'none',
  },

  passwordRequirements: {
    backgroundColor: 'rgba(8, 19, 29, 0.38)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },

  passwordRequirementsTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },

  requirementText: {
    color: '#fecaca',
    fontSize: 12,
    lineHeight: 19,
  },

  requirementPassed: {
    color: '#bbf7d0',
  },

  button: {
    marginTop: 8,
    marginBottom: 18,
    borderRadius: 16,
    overflow: 'hidden',
  },

  buttonGradient: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  footerText: {
    color: '#eef7fc',
    textAlign: 'center',
    fontSize: 14,
  },

  loginLink: {
    color: '#9edcff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
