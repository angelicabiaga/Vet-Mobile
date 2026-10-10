import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerHeaderGreeting, { getFirstName } from './PetOwnerHeaderGreeting';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SUGGESTED_PROMPTS, askPetAssistant, getLocalReply } from '../../../api/chatbotService';
import { loadQuickAssistHistory, appendQuickAssistHistory, clearQuickAssistHistory } from '../../../api/quickAssistHistoryService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerQuickAssist = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const quickAssistUserId =
    loggedInUser?.id || loggedInUser?.user_id || loggedInUser?.profile_id || loggedInUser?.email || 'pet-owner';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  // The welcome message greets the owner by first name, like the headers.
  const displayName = getFirstName(loggedInUser);
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

  const nowTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const createWelcomeMessage = () => ({
    id: 'welcome',
    role: 'assistant',
    text: `Hi ${displayName}, welcome to PawCruz Pet Care Assistant! How can I help you and your pet today?`,
    time: nowTime(),
  });

  // Last failed AI request, kept for the Retry button (web requestError).
  const [requestError, setRequestError] = React.useState(null);
  const inFlightRef = React.useRef(false);
  const scrollToEnd = () => chatScrollRef.current?.scrollToEnd?.({ animated: true });

  React.useEffect(() => {
    let active = true;

    const restoreHistory = async () => {
      try {
        const saved = await loadQuickAssistHistory(quickAssistUserId);
        if (!active) return;
        setChatMessages(saved.length ? saved : [createWelcomeMessage()]);
      } finally {
        if (active) setHistoryLoaded(true);
      }
    };

    restoreHistory();
    return () => { active = false; };
  }, [quickAssistUserId]);

  const saveToHistory = (message) => {
    appendQuickAssistHistory(quickAssistUserId, message).catch((historyError) => {
      console.warn('Unable to save Quick Assist message:', historyError?.message || historyError);
    });
  };

  const addAssistantMessage = (result) => {
    const aiMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      text: result.reply,
      time: nowTime(),
      urgency: result.urgency,
      suggestedAction: result.suggestedAction,
    };
    setChatMessages((current) => [...current, aiMessage]);
    saveToHistory(aiMessage);
  };

  const requestAssistant = async (history, petId) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRequestError(null);
    setSending(true);
    try {
      addAssistantMessage(await askPetAssistant({ messages: history, petId }));
    } catch (error) {
      setRequestError({
        message: error?.message || 'The pet care assistant is temporarily unavailable. Please try again later.',
        history,
        petId,
      });
    } finally {
      inFlightRef.current = false;
      setSending(false);
      setTimeout(scrollToEnd, 80);
    }
  };

  // Used by the input, the "You can ask" chips and the clinic-hours shortcut.
  const sendMessage = (rawText) => {
    const text = String(rawText || '').trim();
    if (!text || sending || !historyLoaded || inFlightRef.current) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', text, time: nowTime() };
    const history = [...chatMessages, userMessage].map((message) => ({ role: message.role, content: message.text }));
    setChatMessages((current) => [...current, userMessage]);
    saveToHistory(userMessage);
    setInputText('');
    setRequestError(null);

    // Clinic hours, booking, records, queue: answered right away (web getLocalReply).
    const localReply = getLocalReply(text);
    if (localReply) {
      addAssistantMessage(localReply);
      setTimeout(scrollToEnd, 80);
      return;
    }
    requestAssistant(history, null);
  };

  const sendAiMessage = () => sendMessage(inputText);

  const retryLastRequest = () => {
    if (!requestError?.history || inFlightRef.current) return;
    requestAssistant(requestError.history, requestError.petId);
  };

  const clearConversation = () => {
    if (sending || inFlightRef.current) return;
    Alert.alert(
      'Clear Conversation?',
      'Clear your conversation with the PawCruz Pet Care Assistant? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Clear Conversation',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearQuickAssistHistory(quickAssistUserId);
            } catch (error) {
              console.warn('Unable to clear Quick Assist history:', error?.message || error);
            }
            setChatMessages([createWelcomeMessage()]);
            setInputText('');
            setRequestError(null);
          },
        },
      ],
    );
  };

  const goToBooking = () => navigation.navigate('PetOwnerAppointment', { user: loggedInUser });
  const goToMessages = () => navigation.navigate('PetOwnerMessages', { user: loggedInUser });

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
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },  ];

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
            colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBar}
          >
            <LinearGradient
              colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']}
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
                  <Text style={styles.headerSubtitle}>Pet Care Assistant</Text>
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
                  <Image
                      source={DEFAULT_PROFILE_IMAGE}
                      style={styles.profileIcon}
                      resizeMode="contain"
                    />
                </TouchableOpacity>
              </View>
            </View>
            </LinearGradient>

            <View style={styles.headerBottomRow}>
              <View style={messageStyles.headerControls}>

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

              <PetOwnerHeaderGreeting caption="Chat with PawCruz AI" user={loggedInUser} accent={false} />
            </View>

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

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd?.({ animated: true })}
          >
            {/* Intro + disclaimer scroll with the conversation so they never
                squeeze the chat, especially while the keyboard is open. */}
            <View style={styles.aiWelcomeCard}>
              <View style={styles.aiWelcomeTop}>
                <View style={styles.aiAvatarWrap}>
                  <Image source={require('../../assets/chatbot.png')} style={styles.aiAvatarImage} resizeMode="contain" />
                </View>
                <View style={styles.aiWelcomeTextWrap}>
                  <Text style={styles.aiWelcomeTitle}>PawCruz Pet Care Assistant</Text>
                  <View style={styles.aiStatusRow}>
                    <View style={styles.aiStatusDot} />
                    <Text style={styles.aiStatusText}>Online · Responses may take a moment</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.clearChatButton, sending && { opacity: 0.5 }]}
                  onPress={clearConversation}
                  disabled={sending}
                  activeOpacity={0.85}
                  accessibilityLabel="Clear conversation"
                >
                  <Text style={styles.clearChatText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.aiSafetyChip}>
                <Text style={styles.aiSafetyChipText}>For urgent symptoms, contact a veterinarian immediately.</Text>
              </View>
              <Text style={styles.disclaimerText}>
                <Text style={styles.disclaimerStrong}>Educational guidance, not a diagnosis. </Text>
                The assistant cannot prescribe or provide medication doses. Contact a veterinarian
                for medical advice or urgent concerns.
              </Text>

              <Text style={styles.quickActionsLabel}>Quick actions</Text>
              <TouchableOpacity style={styles.quickActionCard} onPress={goToBooking} activeOpacity={0.88}>
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>Book an appointment</Text>
                  <Text style={styles.quickActionSub}>Choose an available schedule</Text>
                </View>
                <Text style={styles.quickActionArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickActionCard, sending && { opacity: 0.5 }]}
                onPress={() => sendMessage('What are your clinic hours?')}
                disabled={sending}
                activeOpacity={0.88}
              >
                <View style={styles.quickActionCopy}>
                  <Text style={styles.quickActionTitle}>View clinic hours</Text>
                  <Text style={styles.quickActionSub}>See today's availability</Text>
                </View>
                <Text style={styles.quickActionArrow}>›</Text>
              </TouchableOpacity>
            </View>

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
                {item.role === 'assistant' && ['emergency', 'same_day'].includes(item.urgency) ? (
                  <View style={[styles.urgencyNotice, item.urgency === 'emergency' ? styles.urgencyEmergency : styles.urgencySameDay]}>
                    <Text style={[styles.urgencyText, item.urgency === 'emergency' ? styles.urgencyEmergencyText : styles.urgencySameDayText]}>
                      {item.urgency === 'emergency'
                        ? '⚠ Emergency veterinary care recommended'
                        : '⚠ Same-day veterinary contact recommended'}
                    </Text>
                  </View>
                ) : null}
                {item.role === 'assistant' && item.suggestedAction === 'book_appointment' ? (
                  <TouchableOpacity style={styles.messageAction} onPress={goToBooking} activeOpacity={0.88}>
                    <Text style={styles.messageActionText}>Book an appointment ›</Text>
                  </TouchableOpacity>
                ) : null}
                {item.role === 'assistant' && item.suggestedAction === 'contact_clinic' ? (
                  <TouchableOpacity style={styles.messageAction} onPress={goToMessages} activeOpacity={0.88}>
                    <Text style={styles.messageActionText}>Contact the clinic ›</Text>
                  </TouchableOpacity>
                ) : null}
                {item.role === 'assistant' && item.suggestedAction === 'emergency_vet' ? (
                  <View style={[styles.messageAction, styles.emergencyAction]}>
                    <Text style={[styles.messageActionText, styles.emergencyActionText]}>
                      Seek the nearest emergency veterinary facility now
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.messageTime}>{item.time}</Text>
              </View>
            ))}
            {sending ? (
              <View style={styles.aiTypingRow}>
                <ActivityIndicator size="small" color="#2c6ba3" />
                <Text style={styles.aiTypingText}>PawCruz AI is responding...</Text>
              </View>
            ) : null}
            {requestError && !sending ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>AI assistant unavailable</Text>
                <Text style={styles.errorText}>{requestError.message}</Text>
                <Text style={styles.errorHint}>
                  If your pet may be in danger, contact a veterinarian or the nearest emergency facility now.
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={retryLastRequest} activeOpacity={0.88}>
                  <Text style={styles.retryText}>↻ Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>

          {/* Hidden while typing so the bar stays compact with the keyboard open. */}
          <View style={[styles.suggestionBar, inputText.trim() ? styles.suggestionBarHidden : null]}>
            <Text style={styles.suggestionLabel}>You can ask</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.suggestionList}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={[styles.suggestionChip, (sending || !historyLoaded) && { opacity: 0.5 }]}
                  onPress={() => sendMessage(prompt)}
                  disabled={sending || !historyLoaded}
                  activeOpacity={0.85}
                >
                  <Text style={styles.suggestionChipText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

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
                selectionColor="#2c6ba3"
                cursorColor="#2c6ba3"
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
        shadowColor: '#2c6ba3',
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
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
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
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
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
    borderColor: '#2c6ba3',
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
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
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
    backgroundColor: 'rgba(44, 107, 163, 0.36)',
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
    backgroundColor: 'rgba(44, 107, 163, 0.98)',
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
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
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

  disclaimerText: {
    marginTop: 8,
    color: '#7a93a2',
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
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
    shadowColor: '#123a5e',
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
    backgroundColor: '#2c6ba3',
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
    backgroundColor: '#2c6ba3',
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
    marginBottom: 14,
    padding: 13,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d5eaf1',
    shadowColor: '#123a5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  aiWelcomeTop: { flexDirection: 'row', alignItems: 'center' },
  aiAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#d5eaf1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiAvatarImage: {
    width: 38,
    height: 38,
  },
  aiWelcomeTextWrap: { flex: 1 },
  aiWelcomeTitle: {
    color: '#123a5e',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  aiStatusRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 5,
  },
  aiStatusText: {
    flexShrink: 1,
    color: '#668697',
    fontSize: 11,
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



  suggestionBar: {
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#d7e8ee',
  },
  suggestionBarHidden: {
    display: 'none',
  },
  suggestionLabel: {
    paddingHorizontal: 14,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
  },
  suggestionList: {
    paddingHorizontal: 12,
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c6e5ed',
    backgroundColor: '#edf6f8',
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2c6ba3',
  },

  clearChatButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d5eaf1',
    backgroundColor: '#f6fbff',
  },
  clearChatText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  disclaimerStrong: {
    fontWeight: '900',
    color: '#5d7b91',
  },
  quickActionsLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e1edf2',
    backgroundColor: '#f8fcfd',
  },
  quickActionCopy: { flex: 1 },
  quickActionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#123a5e',
  },
  quickActionSub: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6a8aa0',
  },
  quickActionArrow: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2c6ba3',
    marginLeft: 8,
  },

  urgencyNotice: {
    maxWidth: '88%',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  urgencyEmergency: { backgroundColor: '#fbe6e4' },
  urgencySameDay: { backgroundColor: '#fdf1dc' },
  urgencyText: { fontSize: 12, fontWeight: '800' },
  urgencyEmergencyText: { color: '#c0392b' },
  urgencySameDayText: { color: '#a5680b' },
  messageAction: {
    maxWidth: '88%',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#2c6ba3',
  },
  messageActionText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#ffffff',
  },
  emergencyAction: { backgroundColor: '#fbe6e4' },
  emergencyActionText: { color: '#c0392b' },

  errorCard: {
    marginTop: 4,
    marginBottom: 10,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0c5c5',
    backgroundColor: '#fff4f4',
  },
  errorTitle: { fontSize: 13.5, fontWeight: '900', color: '#991b1b' },
  errorText: { marginTop: 4, fontSize: 12.5, fontWeight: '600', color: '#7f1d1d', lineHeight: 18 },
  errorHint: { marginTop: 6, fontSize: 11, fontWeight: '600', color: '#9b4b4b', lineHeight: 16 },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#2c6ba3',
  },
  retryText: { fontSize: 12.5, fontWeight: '900', color: '#ffffff' },

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
