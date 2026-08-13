import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as messageStyles } from '../../styles/PetOwnerMessagesDesign';
import { askPawCruzAI } from '../../../api/aiService';
import { loadQuickAssistHistory, appendQuickAssistHistory } from '../../../api/quickAssistHistoryService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerQuickAssist = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const quickAssistUserId =
    loggedInUser?.id || loggedInUser?.user_id || loggedInUser?.profile_id || loggedInUser?.email || 'pet-owner';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const displayName =
    loggedInUser?.fullName ||
    loggedInUser?.name ||
    loggedInUser?.username ||
    'Pet Owner';
  const headerMenuAnimation = React.useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(() =>
    new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }).toLowerCase(),
  );
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState([]);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const chatScrollRef = React.useRef(null);

  React.useEffect(() => {
    let active = true;

    const restoreHistory = async () => {
      try {
        const saved = await loadQuickAssistHistory(quickAssistUserId);
        if (!active) return;

        if (saved.length) {
          setChatMessages(saved);
        } else {
          setChatMessages([
            {
              id: 'welcome',
              role: 'assistant',
              text: `Hi ${displayName}, welcome to PawCruz Quick Assist! How can I help you and your pet today?`,
              time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
            },
          ]);
        }
      } finally {
        if (active) setHistoryLoaded(true);
      }
    };

    restoreHistory();
    return () => { active = false; };
  }, [quickAssistUserId]);

  const sendAiMessage = async () => {
    const text = inputText.trim();
    if (!text || sending || !historyLoaded) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
    };

    const previous = chatMessages;
    setChatMessages((current) => [...current, userMessage]);
    appendQuickAssistHistory(quickAssistUserId, userMessage).catch((historyError) => {
      console.warn('Unable to save Quick Assist user message:', historyError?.message || historyError);
    });
    setInputText('');
    setSending(true);

    try {
      const reply = await askPawCruzAI(text, previous);
      const aiMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
      };
      setChatMessages((current) => [...current, aiMessage]);
      appendQuickAssistHistory(quickAssistUserId, aiMessage).catch((historyError) => {
        console.warn('Unable to save Quick Assist AI message:', historyError?.message || historyError);
      });
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          text: error?.message || 'PawCruz AI is temporarily unavailable.',
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 80);
    }
  };


  React.useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }).toLowerCase(),
      );
    }, 1000 * 30);

    return () => clearInterval(timerId);
  }, []);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
  ];

  const toggleHeaderMenu = () => {
    const nextVisible = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(nextVisible);
    Animated.timing(headerMenuAnimation, {
      toValue: nextVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderMenuPress = (routeName) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigation.navigate(routeName, { user: loggedInUser });
  };

  return (
    <LinearGradient
      colors={['#f7fbfc', '#eef7f8', '#ffffff']}
      style={styles.background}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 18}
        >
        <View style={styles.container}>
          <LinearGradient
            colors={['#63B6C5', '#63B6C5', '#63B6C5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBar}
          >
            <LinearGradient
              colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerTopBand}
            >
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.brandSection}
                onPress={() => navigation.navigate('petowner-screen', { user: loggedInUser })}
                activeOpacity={0.85}
              >
                <View style={styles.logoWrap}>
                  <Image
                    source={require('../../assets/paw1.png')}
                    style={styles.headerLogo}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Quick Assist</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.notifButton}
                  onPress={() => navigation.navigate('PetOwnerNotif', { user: loggedInUser })}
                  activeOpacity={0.85}
                >
                  <View style={styles.notifBadge} />
                  <Image
                    source={require('../../assets/Bell_Icon.png')}
                    style={styles.notifIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => navigation.navigate('PetOwnerProfile', { user: loggedInUser })}
                  activeOpacity={0.85}
                >
                  {profileImageUri ? (
                    <Image
                      source={{ uri: profileImageUri }}
                      style={styles.profileButtonImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Image
                      source={DEFAULT_PROFILE_IMAGE}
                      style={styles.profileIcon}
                      resizeMode="contain"
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            </LinearGradient>

            <View style={styles.headerBottomRow}>
              <View style={messageStyles.headerControls}>
                <TouchableOpacity
                  style={styles.menuTriggerButton}
                  onPress={toggleHeaderMenu}
                  activeOpacity={0.85}
                >
                  <Image
                    source={require('../../assets/List.png')}
                    style={styles.menuTriggerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={messageStyles.backTriggerButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.85}
                >
                  <Image
                    source={require('../../assets/Back_Icon.png')}
                    style={messageStyles.backTriggerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>AI Cruz Chatbot</Text>
                <Text style={styles.ownerName}>{displayName}</Text>
              </View>
            </View>

            <PetOwnerSideDrawer visible={isHeaderMenuVisible} onClose={() => setIsHeaderMenuVisible(false)} navigation={navigation} user={loggedInUser} />
            {false ? (
              <Animated.View
                style={[
                  styles.headerMenuPanel,
                  {
                    opacity: headerMenuAnimation,
                    transform: [
                      {
                        translateY: headerMenuAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-18, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {headerMenuItems.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.headerMenuItem}
                    onPress={() => handleHeaderMenuPress(item.route)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.headerMenuItemIconWrap}>
                      <Image
                        source={item.icon}
                        style={styles.headerMenuItemIcon}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            ) : null}
          </LinearGradient>

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerText}>
              Disclaimer: Quick Assist responses are AI-generated and designed to provide
              general information and guidance. Please verify important health concerns
              with a veterinarian for proper care.
            </Text>
          </View>

          <View style={styles.aiWelcomeCard}>
            <View style={styles.aiWelcomeTop}>
              <View style={styles.aiAvatarWrap}>
                <Image source={require('../../assets/support.png')} style={styles.aiAvatarImage} resizeMode="contain" />
              </View>
              <View style={styles.aiWelcomeTextWrap}>
                <Text style={styles.aiWelcomeEyebrow}>PAWCRUZ QUICK ASSIST</Text>
                <Text style={styles.aiWelcomeTitle}>Ask PawCruz AI</Text>
                <Text style={styles.aiWelcomeBody}>Get quick, general pet-care guidance and help understanding PawCruz records.</Text>
              </View>
            </View>
            <View style={styles.aiSafetyChip}>
              <Text style={styles.aiSafetyChipText}>For urgent symptoms, contact a veterinarian immediately.</Text>
            </View>
          </View>

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd?.({ animated: true })}
          >
            {chatMessages.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.messageRow,
                  item.role === 'user' && styles.userMessageRow,
                ]}
              >
                <View
                  style={[
                    styles.messageCard,
                    item.role === 'user' && styles.userMessageCard,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      item.role === 'user' && styles.userMessageText,
                    ]}
                  >
                    {item.text}
                  </Text>
                </View>
                <Text style={styles.messageTime}>{item.time}</Text>
              </View>
            ))}
            {sending ? (
              <View style={styles.aiTypingRow}>
                <ActivityIndicator size="small" color="#447C99" />
                <Text style={styles.aiTypingText}>PawCruz AI is responding...</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[messageStyles.inputBar, styles.aiInputBar]}>
            <View style={[messageStyles.inlineInputWrap, styles.aiInputWrap]}>
              <TextInput
                editable={!sending && historyLoaded}
                placeholder="Enter your inquiries here..."
                placeholderTextColor="#8aa2b4"
                style={[messageStyles.inlineInput, styles.aiInput]}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendAiMessage}
                returnKeyType="send"
                textAlignVertical="center"
                selectionColor="#447C99"
                cursorColor="#447C99"
                autoCorrect={true}
              />
              <TouchableOpacity onPress={sendAiMessage} disabled={!inputText.trim() || sending || !historyLoaded} activeOpacity={0.8}>
                <Image
                  source={require('../../assets/send.png')}
                  style={[messageStyles.inlineSendImage, (!inputText.trim() || sending || !historyLoaded) && { opacity: 0.4 }]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  headerBar: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },


  headerTopBand: {
    marginHorizontal: -22,
    marginTop: -18,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230, 246, 250, 0.24)',
  },  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },

  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  headerLogo: {
    width: 34,
    height: 34,
  },

  brandBlock: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#c3ddee',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  notifButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  notifBadge: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#f47c6b',
    borderWidth: 2,
    borderColor: '#447C99',
  },

  notifIcon: {
    width: 21,
    height: 21,
    tintColor: '#ffffff',
  },

  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    overflow: 'hidden',
  },

  profileButtonImage: {
    width: '100%',
    height: '100%',
  },

  profileIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  headerBottomRow: {
    marginTop: 14,
    paddingTop: 0,
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  menuTriggerButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  menuTriggerIcon: {
    width: 30,
    height: 30,
    tintColor: '#ffffff',
  },

  ownerSummary: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },

  headerCaption: {
    fontSize: 12,
    color: '#b8d4e5',
    fontWeight: '700',
    textAlign: 'right',
  },

  ownerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
    textAlign: 'right',
  },

  headerMenuPanel: {
    marginTop: 14,
    width: '100%',
    padding: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(68, 124, 153, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'stretch',
  },

  headerMenuItem: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  headerMenuItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  headerMenuItemIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  headerMenuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  disclaimerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: '#f7fbfc',
    borderWidth: 1,
    borderColor: '#dbeaf0',
  },

  disclaimerText: {
    color: '#597789',
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center',
  },

  chatArea: {
    flex: 1,
    minHeight: 0,
  },

  chatContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    flexGrow: 1,
  },

  messageRow: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  messageCard: {
    maxWidth: '88%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderTopLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#dceaf0',
    shadowColor: '#24566d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },

  messageText: {
    color: '#244f63',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },

  addPetButton: {
    marginTop: 20,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addPetButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
  },

  messageTime: {
    marginTop: 4,
    marginHorizontal: 4,
    color: '#8298a4',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },


  userMessageRow: {
    alignItems: 'flex-end',
  },

  userMessageCard: {
    maxWidth: '88%',
    backgroundColor: '#447C99',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 6,
    alignSelf: 'flex-end',
  },

  userMessageText: {
    color: '#ffffff',
  },

  aiTypingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eef7f8',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
  },

  aiTypingText: {
    marginLeft: 8,
    color: '#5d7b91',
    fontSize: 12,
    fontWeight: '700',
  },

  aiWelcomeCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 13,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d5eaf1',
    shadowColor: '#24566d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  aiWelcomeTop: { flexDirection: 'row', alignItems: 'center' },
  aiAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#e8f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  aiAvatarImage: {
    width: 34,
    height: 34,
  },
  aiWelcomeTextWrap: { flex: 1 },
  aiWelcomeEyebrow: {
    color: '#2b94bd',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  aiWelcomeTitle: {
    marginTop: 2,
    color: '#24566d',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
  },
  aiWelcomeBody: {
    marginTop: 3,
    color: '#668697',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  aiSafetyChip: {
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#f4f9fb',
    borderWidth: 1,
    borderColor: '#e1edf2',
  },
  aiSafetyChipText: {
    color: '#587787',
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
  },

  keyboardAvoid: {
    flex: 1,
  },

  aiInputBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#d7e8ee',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 8 : 10,
    elevation: 20,
    zIndex: 50,
  },

  aiInputWrap: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#bfdce7',
    paddingLeft: 13,
    paddingRight: 7,
  },

  aiInput: {
    flex: 1,
    minHeight: 44,
    color: '#173f53',
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '600',
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    opacity: 1,
  },
});

export default PetOwnerQuickAssist;
