import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from '../screens/dashboards/PetOwner/PetOwnerSideDrawer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Easing, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  createConversation, getConversations, getMessageContacts, getMessages,
  markConversationRead, sendMessage, subscribeToMessages, subscribeToMessagingOverview,
} from "../api/messageService";
import { supabase } from "../config/supabaseClient";

const normalizeRole = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
const DEFAULT_PROFILE_IMAGE = require("../screens/assets/Profile.png");

export default function MobileMessagingScreen({ navigation, route, allowedRoles = [], title = "Messages", backRoute }) {
  const profile = route?.params?.user || {};
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [subject, setSubject] = useState("");
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);

  const profileImageUri = profile?.profileImageUri || profile?.avatar || profile?.avatar_url || "";
  const displayName = profile?.full_name || profile?.fullName || profile?.name || profile?.username || "Pet Owner";
  const currentRole = normalizeRole(profile?.role);

  const ROLE_META = {
    veterinarian: {
      dashboardRoute: "vet-screen",
      notificationRoute: "VetNotif",
      profileRoute: "VetProfile",
      showQuickAssist: false,
      subtitle: "Veterinarian Messages",
      sideDrawerRole: "veterinarian",
      headerMenuItems: [
        { key: "dashboard", label: "Dashboard", icon: require("../screens/assets/Dashboard_Icon.png"), route: "vet-screen" },
        { key: "appointments", label: "My Appointments", icon: require("../screens/assets/Appointment_Icon.png"), route: "VetAppointment" },
        { key: "patients", label: "Patients", icon: require("../screens/assets/Pets_Icon.png"), route: "VetPatients" },
        { key: "messages", label: "Messages", icon: require("../screens/assets/Message_Icon.png"), route: "VetMessages" },
        { key: "medical", label: "Medical Records", icon: require("../screens/assets/Medical_Icon.png"), route: "VetMedRec" },
      ],
    },
    staff: {
      dashboardRoute: "staff-screen",
      notificationRoute: "StaffNotif",
      profileRoute: "StaffProfile",
      showQuickAssist: false,
      subtitle: "Staff Messages",
      sideDrawerRole: "staff",
      headerMenuItems: [
        { key: "dashboard", label: "Dashboard", icon: require("../screens/assets/Dashboard_Icon.png"), route: "staff-screen" },
        { key: "appointment", label: "Appointment", icon: require("../screens/assets/Appointment_Icon.png"), route: "StaffAppointment" },
        { key: "mypets", label: "Pets Profile", icon: require("../screens/assets/Pets_Icon.png"), route: "StaffPetsProfile" },
        { key: "messages", label: "Messages", icon: require("../screens/assets/Message_Icon.png"), route: "StaffMessages" },
      ],
    },
    pet_owner: {
      dashboardRoute: "petowner-screen",
      notificationRoute: "PetOwnerNotif",
      profileRoute: "PetOwnerProfile",
      showQuickAssist: true,
      subtitle: "Pet Owner Messages",
      sideDrawerRole: "pet_owner",
      headerMenuItems: [
        { key: "dashboard", label: "Dashboard", icon: require("../screens/assets/Dashboard_Icon.png"), route: "petowner-screen" },
        { key: "appointment", label: "Appointment", icon: require("../screens/assets/Appointment_Icon.png"), route: "PetOwnerAppointment" },
        { key: "queue", label: "My Queue", icon: require("../screens/assets/List.png"), route: "PetOwnerQueue" },
        { key: "mypets", label: "My Pets", icon: require("../screens/assets/Pets_Icon.png"), route: "PetOwnerMyPets" },
        { key: "messages", label: "Messages", icon: require("../screens/assets/Message_Icon.png"), route: "PetOwnerMessages" },
        { key: "medical", label: "Medical Records", icon: require("../screens/assets/Medical_Icon.png"), route: "PetOwnerMedRec" },
      ],
    },
  };

  const roleMeta = ROLE_META[currentRole] || ROLE_META.pet_owner;
  const { headerMenuItems } = roleMeta;

  const toggleHeaderMenu = () => {
    const nextVisible = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(nextVisible);
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: nextVisible ? 1 : 0,
      duration: nextVisible ? 240 : 200,
      easing: nextVisible ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderMenuPress = (routeName) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigation.navigate(routeName, { user: profile });
  };

  const { notificationRoute, profileRoute, dashboardRoute } = roleMeta;

  const allowedKey = allowedRoles.map(normalizeRole).join("|");
  const allowed = useMemo(() => allowedKey ? allowedKey.split("|") : [], [allowedKey]);
  const roleAllowed = useCallback((role) => !allowed.length || allowed.includes(normalizeRole(role)), [allowed]);

  const conversationMatches = useCallback((conversation) => {
    if (!allowed.length) return true;
    return (conversation.participants || []).some((p) => p.id !== profile.id && roleAllowed(p.role));
  }, [allowed.length, profile.id, roleAllowed]);

  const loadOverview = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [conversationRows, contactRows] = await Promise.all([getConversations(profile), getMessageContacts(profile)]);
      setConversations((conversationRows || []).filter(conversationMatches));
      setContacts((contactRows || []).filter((contact) => roleAllowed(contact.role)));
    } catch (error) {
      Alert.alert("Messages", error.message || "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id, conversationMatches, roleAllowed]);

  useEffect(() => { setLoading(true); loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    const channel = subscribeToMessagingOverview(profile.id, () => {
      if (active) loadOverview();
    });
    const fallbackTimer = setInterval(() => {
      if (active) loadOverview();
    }, 5000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile?.id, loadOverview]);


  const loadActive = useCallback(async () => {
    if (!activeConversation?.id || !profile?.id) return;
    try {
      setMessagesLoading(true);
      const rows = await getMessages(activeConversation.id);
      setMessages(rows || []);
      await markConversationRead(activeConversation.id, profile.id);
      await loadOverview();
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (error) {
      Alert.alert("Messages", error.message || "Unable to load the conversation.");
    } finally {
      setMessagesLoading(false);
    }
  }, [activeConversation?.id, profile?.id, loadOverview]);

  useEffect(() => {
    if (!activeConversation?.id) { setMessages([]); return undefined; }

    let active = true;
    loadActive();

    const channel = subscribeToMessages(activeConversation.id, async () => {
      if (active) await loadActive();
    });
    const fallbackTimer = setInterval(async () => {
      if (active) await loadActive();
    }, 3000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, loadActive]);

  const otherParticipantsFor = (conversation) =>
    (conversation?.participants || []).filter((p) => p.id !== profile.id);

  const roleLabel = (role) => {
    const value = normalizeRole(role);
    if (value === "veterinarian") return "Veterinarian";
    if (value === "pet_owner" || value === "petowner") return "Pet Owner";
    if (value === "admin" || value === "administrator") return "Administrator";
    if (value === "staff") return "Staff";
    return String(role || "PawCruz User");
  };

  const titleFor = (conversation) => {
    const others = otherParticipantsFor(conversation);
    const names = others
      .map((p) => p.full_name || p.username || p.email)
      .filter(Boolean);
    return names.join(", ") || "PawCruz Conversation";
  };

  const subtitleFor = (conversation) => {
    const others = otherParticipantsFor(conversation);
    return others.map((p) => roleLabel(p.role)).filter(Boolean).join(" • ") || "PawCruz";
  };

  const previewFor = (conversation) => {
    const latest = conversation?.latest;
    if (!latest) return "No messages yet";
    const content = latest.body || latest.attachment_name || "Attachment";
    if (latest.sender_id === profile.id) return `You: ${content}`;
    const sender = (conversation.participants || []).find((p) => p.id === latest.sender_id);
    const senderName = sender?.full_name || sender?.username || "PawCruz User";
    return `${senderName}: ${content}`;
  };

  const createNew = async () => {
    if (!selectedContact?.id) return Alert.alert("New Conversation", "Choose a recipient first.");
    try {
      const conversation = await createConversation(profile, [selectedContact.id], subject || `Chat with ${selectedContact.full_name || "PawCruz"}`);
      setShowNew(false); setSelectedContact(null); setSubject("");
      await loadOverview();
      const refreshed = await getConversations(profile);
      setActiveConversation((refreshed || []).find((c) => c.id === conversation.id) || conversation);
    } catch (error) {
      Alert.alert("New Conversation", error.message || "Unable to create conversation.");
    }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (!result.canceled && result.assets?.[0]) setFile(result.assets[0]);
    } catch (error) { Alert.alert("Attachment", "Unable to select that file."); }
  };

  const submit = async () => {
    if (!activeConversation?.id || sending || (!body.trim() && !file)) return;
    try {
      setSending(true);
      await sendMessage(activeConversation.id, profile, body, file);
      setBody(""); setFile(null);
      await loadActive();
    } catch (error) {
      Alert.alert("Send Message", error.message || "Unable to send message.");
    } finally { setSending(false); }
  };

  const back = () => {
    if (activeConversation) { setActiveConversation(null); return; }
    if (backRoute) navigation.navigate(backRoute, { user: profile }); else navigation.goBack();
  };

  if (!profile?.id) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errorText}>Your login session is incomplete. Please log in again.</Text></View></SafeAreaView>;
  }

  return (
    <LinearGradient colors={["#eef9fb", "#f8fcfd", "#ffffff"]} style={styles.safe}>
      <SafeAreaView style={styles.safe}>
        <LinearGradient colors={["#63B6C5", "#63B6C5", "#63B6C5"]} style={styles.dashboardHeader}>
          <LinearGradient colors={["#1f4e66", "#2f6f86", "#447C99", "#5f9eb4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dashboardTopBand}>
            <View style={styles.dashboardTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate(dashboardRoute, { user: profile })} activeOpacity={0.85}>
                <View style={styles.logoWrap}>
                  <Image source={require("../screens/assets/paw1.png")} style={styles.headerLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandBlock}>
                  <Text style={styles.brandTitle}>PawCruz</Text>
                  <Text style={styles.brandSubtitle}>{roleMeta.subtitle}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate(notificationRoute, { user: profile })} activeOpacity={0.85}>
                  <Image source={require("../screens/assets/Bell_Icon.png")} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate(profileRoute, { user: profile })} activeOpacity={0.85}>
                  {profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.dashboardBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
              <Image source={require("../screens/assets/List.png")} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>{activeConversation ? "Chatting with" : "Messages"}</Text>
              <Text style={styles.ownerName} numberOfLines={1}>{activeConversation ? titleFor(activeConversation) : displayName}</Text>
            </View>
          </View>

          <PetOwnerSideDrawer
            visible={isHeaderMenuVisible}
            onClose={() => setIsHeaderMenuVisible(false)}
            navigation={navigation}
            user={profile}
            activeKey="messages"
            role={roleMeta.sideDrawerRole}
          />
          {false ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }, { scale: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={[styles.headerMenuItem, item.key === "messages" && styles.headerMenuItemActive]} onPress={() => handleHeaderMenuPress(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}>
                    <Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        {activeConversation ? (
          <View style={styles.chatSubHeader}>
            <TouchableOpacity onPress={back} style={styles.backMiniButton}><Text style={styles.backMiniText}>‹</Text></TouchableOpacity>
            <View style={styles.chatSubHeaderText}>
              <Text style={styles.chatSubTitle}>{titleFor(activeConversation)}</Text>
              <Text style={styles.chatSubRole}>{subtitleFor(activeConversation)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.messagesToolbar}>
            <Text style={styles.messagesToolbarTitle}>Conversations</Text>
            <TouchableOpacity onPress={() => setShowNew(true)} style={styles.newConversationButton} activeOpacity={0.85}>
              <Text style={styles.newConversationButtonText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeConversation ? (
          loading ? <View style={styles.center}><ActivityIndicator size="large" color="#447C99" /></View> :
          <FlatList
            data={conversations}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={conversations.length ? styles.listContent : styles.emptyContent}
            refreshing={loading}
            onRefresh={() => { setLoading(true); loadOverview(); }}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.emptyText}>Tap + to start a conversation.</Text><TouchableOpacity style={styles.primary} onPress={() => setShowNew(true)}><Text style={styles.primaryText}>Start Conversation</Text></TouchableOpacity></View>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.conversationCard} onPress={() => setActiveConversation(item)} activeOpacity={0.88}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{titleFor(item).charAt(0).toUpperCase()}</Text></View>
                <View style={styles.conversationBody}>
                  <View style={styles.row}><Text style={styles.conversationTitle} numberOfLines={1}>{titleFor(item)}</Text>{item.unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View> : null}</View>
                  <Text style={styles.roleText} numberOfLines={1}>{subtitleFor(item)}</Text>
                  <Text style={styles.preview} numberOfLines={1}>{previewFor(item)}</Text>
                  <Text style={styles.time}>{new Date(item.last_message_at || item.created_at).toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        ) : (
          <KeyboardAvoidingView
            style={styles.chatWrap}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            {messagesLoading ? <ActivityIndicator style={{ marginTop: 20 }} color="#447C99" /> : null}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                const mine = item.sender_id === profile.id;
                return <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  <Text style={[styles.sender, mine && styles.senderMine]}>{mine ? (profile.full_name || profile.fullName || profile.username || "You") : (item.sender?.full_name || "PawCruz User")}</Text>
                  {item.body ? <Text style={styles.messageText}>{item.body}</Text> : null}
                  {item.attachment_url ? <TouchableOpacity onPress={() => Linking.openURL(item.attachment_url)}><Text style={styles.attachment}>📎 {item.attachment_name || "Attachment"}</Text></TouchableOpacity> : null}
                  <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>;
              }}
              ListEmptyComponent={!messagesLoading ? <View style={styles.emptyChat}><Text style={styles.emptyText}>No messages yet. Say hello.</Text></View> : null}
            />
            {file ? <View style={styles.fileBar}><Text style={styles.fileName} numberOfLines={1}>Attached: {file.name}</Text><TouchableOpacity onPress={() => setFile(null)}><Text style={styles.removeFile}>×</Text></TouchableOpacity></View> : null}
            <View style={styles.composer}>
              <TouchableOpacity style={styles.attachButton} onPress={pickAttachment} activeOpacity={0.8}>
                <Text style={styles.attachText}>＋</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                style={styles.inputTouchArea}
                onPress={() => inputRef.current?.focus()}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Type a message..."
                  placeholderTextColor="#8aa0af"
                  multiline
                  editable={!sending}
                  selectTextOnFocus={false}
                  blurOnSubmit={false}
                  textAlignVertical="top"
                  autoCorrect
                  autoCapitalize="sentences"
                  returnKeyType="default"
                  onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }))}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendButton, (sending || (!body.trim() && !file)) && styles.sendButtonDisabled]}
                onPress={submit}
                disabled={sending || (!body.trim() && !file)}
                activeOpacity={0.8}
              >
                <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {roleMeta.showQuickAssist ? (
          <View style={styles.quickAssistFloat}>
            <TouchableOpacity
              style={styles.quickAssistTouch}
              onPress={() => navigation.navigate("PetOwnerQuickAssist", { user: profile })}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Open Quick Assist"
            >
              <View style={styles.quickAssistIconWrap}>
                <Image
                  source={require("../screens/assets/support.png")}
                  style={styles.quickAssistIcon}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        <Modal visible={showNew} transparent animationType="fade" onRequestClose={() => setShowNew(false)}>
          <View style={styles.modalOverlay}><View style={styles.modalCard}>
            <View style={styles.row}><Text style={styles.modalTitle}>New Conversation</Text><TouchableOpacity onPress={() => setShowNew(false)}><Text style={styles.close}>×</Text></TouchableOpacity></View>
            <TextInput style={styles.subjectInput} value={subject} onChangeText={setSubject} placeholder="Subject (optional)" placeholderTextColor="#8aa0af" />
            <Text style={styles.recipientLabel}>Choose recipient</Text>
            <FlatList data={contacts} keyExtractor={(item) => String(item.id)} style={styles.contactsList}
              ListEmptyComponent={<Text style={styles.emptyText}>No active recipients found.</Text>}
              renderItem={({ item }) => <TouchableOpacity style={[styles.contactRow, selectedContact?.id === item.id && styles.contactSelected]} onPress={() => setSelectedContact(item)}>
                <View style={styles.avatarSmall}><Text style={styles.avatarSmallText}>{(item.full_name || item.username || "U").charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.contactName}>{item.full_name || item.username || item.email}</Text><Text style={styles.contactRole}>{String(item.role || "").replace(/_/g, " ")}{item.email ? ` • ${item.email}` : ""}</Text></View>
              </TouchableOpacity>}
            />
            <TouchableOpacity style={[styles.primary, !selectedContact && { opacity: 0.5 }]} onPress={createNew} disabled={!selectedContact}><Text style={styles.primaryText}>Create Conversation</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1},
  dashboardHeader:{marginHorizontal:0,marginTop:0,marginBottom:12,paddingHorizontal:22,paddingTop:18,paddingBottom:20,borderBottomLeftRadius:30,borderBottomRightRadius:30,shadowColor:"#447C99",shadowOffset:{width:0,height:8},shadowOpacity:0.18,shadowRadius:14,elevation:8},
  dashboardTopBand:{marginHorizontal:-22,marginTop:-18,paddingHorizontal:22,paddingTop:18,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"rgba(230,246,250,0.24)"},
  dashboardTopRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  brandSection:{flexDirection:"row",alignItems:"center",flex:1,marginRight:12},
  logoWrap:{width:64,height:64,justifyContent:"center",alignItems:"center",marginRight:12},
  headerLogo:{width:48,height:48},
  brandBlock:{flex:1},
  brandTitle:{fontSize:28,fontWeight:"900",color:"#ffffff"},
  brandSubtitle:{fontSize:12,fontWeight:"700",color:"#c3ddee",marginTop:3},
  headerActions:{flexDirection:"row",alignItems:"center"},
  notifButton:{width:46,height:46,borderRadius:15,backgroundColor:"rgba(68,124,153,0.42)",borderWidth:1,borderColor:"rgba(222,242,247,0.34)",justifyContent:"center",alignItems:"center"},
  notifIcon:{width:24,height:24,tintColor:"#ffffff"},
  profileButton:{width:46,height:46,borderRadius:15,backgroundColor:"rgba(68,124,153,0.42)",borderWidth:1,borderColor:"rgba(222,242,247,0.34)",justifyContent:"center",alignItems:"center",marginLeft:10,overflow:"hidden"},
  profileIcon:{width:25,height:25,tintColor:"#ffffff"},
  profileButtonImage:{width:"100%",height:"100%"},
  dashboardBottomRow:{marginTop:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  menuTriggerButton:{width:58,height:58,borderRadius:18,backgroundColor:"rgba(68,124,153,0.36)",borderWidth:1,borderColor:"rgba(222,242,247,0.3)",justifyContent:"center",alignItems:"center"},
  menuTriggerIcon:{width:30,height:30,tintColor:"#ffffff"},
  ownerSummary:{flex:1,alignItems:"flex-end",marginLeft:12},
  headerCaption:{fontSize:12,color:"#b8d4e5",fontWeight:"700",textAlign:"right"},
  ownerName:{fontSize:18,fontWeight:"800",color:"#ffffff",marginTop:4,textAlign:"right",maxWidth:"78%"},
  headerMenuPanel:{marginTop:14,width:"100%",padding:14,borderRadius:28,backgroundColor:"rgba(68,124,153,0.98)",borderWidth:1,borderColor:"rgba(255,255,255,0.12)",alignSelf:"stretch"},
  headerMenuItem:{minHeight:58,borderRadius:18,backgroundColor:"rgba(255,255,255,0.22)",flexDirection:"row",alignItems:"center",paddingHorizontal:14,marginBottom:12},
  headerMenuItemActive:{backgroundColor:"rgba(255,255,255,0.34)",borderWidth:1,borderColor:"rgba(255,255,255,0.28)"},
  headerMenuItemIconWrap:{width:34,height:34,borderRadius:12,backgroundColor:"rgba(68,124,153,0.42)",justifyContent:"center",alignItems:"center",marginRight:14},
  headerMenuItemIcon:{width:21,height:21,tintColor:"#ffffff"},
  headerMenuItemLabel:{flex:1,fontSize:14,fontWeight:"800",color:"#ffffff"},
  messagesToolbar:{marginHorizontal:16,marginBottom:6,paddingHorizontal:4,paddingVertical:8,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  messagesToolbarTitle:{fontSize:22,fontWeight:"900",color:"#214f67"},
  newConversationButton:{width:44,height:44,borderRadius:14,backgroundColor:"#4DA8DA",alignItems:"center",justifyContent:"center",shadowColor:"#214f67",shadowOpacity:0.16,shadowRadius:8,elevation:4},
  newConversationButtonText:{fontSize:28,lineHeight:31,fontWeight:"400",color:"#ffffff"},
  chatSubHeader:{marginHorizontal:16,marginBottom:8,padding:12,borderRadius:18,backgroundColor:"#ffffff",borderWidth:1,borderColor:"#d8eaf1",flexDirection:"row",alignItems:"center",shadowColor:"#214f67",shadowOpacity:0.08,shadowRadius:8,elevation:2},
  backMiniButton:{width:40,height:40,borderRadius:13,backgroundColor:"#e9f6fb",alignItems:"center",justifyContent:"center",marginRight:10},
  backMiniText:{fontSize:32,lineHeight:34,color:"#214f67",fontWeight:"500"},
  chatSubHeaderText:{flex:1},
  chatSubTitle:{fontSize:17,fontWeight:"900",color:"#214f67"},
  chatSubRole:{fontSize:12,fontWeight:"700",color:"#628394",marginTop:2}, header:{minHeight:92,paddingHorizontal:16,paddingVertical:14,flexDirection:"row",alignItems:"center"},
  headerButton:{width:44,height:44,borderRadius:16,borderWidth:1,borderColor:"#ffffff55",alignItems:"center",justifyContent:"center"},headerButtonText:{fontSize:36,lineHeight:38,color:"#fff",fontWeight:"500"},
  headerTextWrap:{flex:1,marginHorizontal:12},headerTitle:{fontSize:20,fontWeight:"900",color:"#fff"},headerSubtitle:{fontSize:12,fontWeight:"700",color:"#d9eef5",marginTop:3},
  newButton:{width:44,height:44,borderRadius:16,backgroundColor:"#ffffff22",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#ffffff55"},newButtonText:{fontSize:28,color:"#fff",fontWeight:"700"},headerSpacer:{width:44},
  center:{flex:1,alignItems:"center",justifyContent:"center",padding:25},errorText:{textAlign:"center",color:"#9b4242",fontWeight:"700"},listContent:{padding:16,paddingBottom:40},emptyContent:{flexGrow:1,padding:24,justifyContent:"center"},
  conversationCard:{flexDirection:"row",backgroundColor:"#fcfeff",borderRadius:22,borderWidth:1,borderColor:"#d9eaf1",padding:14,marginBottom:12,shadowColor:"#214f67",shadowOpacity:.05,shadowRadius:10,elevation:2},avatar:{width:50,height:50,borderRadius:18,backgroundColor:"#e2f3f6",alignItems:"center",justifyContent:"center",marginRight:12},avatarText:{fontSize:20,fontWeight:"900",color:"#2f6f86"},conversationBody:{flex:1},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},roleText:{fontSize:12,color:"#447C99",fontWeight:"700",marginTop:2,marginBottom:2},conversationTitle:{flex:1,fontSize:15,fontWeight:"900",color:"#244f64",marginRight:8},preview:{fontSize:13,color:"#668092",fontWeight:"600",marginTop:5},time:{fontSize:10,color:"#8da1ad",fontWeight:"700",marginTop:7},badge:{minWidth:24,height:24,borderRadius:12,backgroundColor:"#447C99",alignItems:"center",justifyContent:"center",paddingHorizontal:6},badgeText:{color:"#fff",fontSize:11,fontWeight:"900"},
  empty:{alignItems:"center"},emptyTitle:{fontSize:20,fontWeight:"900",color:"#24566d"},emptyText:{fontSize:13,color:"#728a99",fontWeight:"600",textAlign:"center",marginTop:7,marginBottom:16},primary:{backgroundColor:"#447C99",paddingVertical:13,paddingHorizontal:20,borderRadius:14,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},
  chatWrap:{flex:1},messagesContent:{padding:16,paddingBottom:20},bubble:{alignSelf:"flex-start",maxWidth:"82%",backgroundColor:"#fcfeff",borderRadius:18,borderTopLeftRadius:5,padding:12,marginBottom:10,borderWidth:1,borderColor:"#dfedf2"},bubbleMine:{alignSelf:"flex-end",backgroundColor:"#dff3f8",borderTopLeftRadius:18,borderTopRightRadius:5,borderColor:"#c6e5ed"},senderMine:{textAlign:"right",color:"#2f6f86"},sender:{fontSize:10,fontWeight:"900",color:"#447C99",marginBottom:4},messageText:{fontSize:14,lineHeight:20,color:"#294b5d",fontWeight:"600"},messageTime:{fontSize:9,color:"#8499a5",marginTop:6},attachment:{fontSize:13,color:"#217ba7",fontWeight:"800",marginTop:4},emptyChat:{paddingTop:80,alignItems:"center"},
  composer:{flexDirection:"row",alignItems:"flex-end",paddingHorizontal:14,paddingTop:10,paddingBottom:Platform.OS === "ios" ? 10 : 12,borderTopWidth:1,borderColor:"#dbeaf0",backgroundColor:"#fcfeff",gap:8,zIndex:20,elevation:20},attachButton:{width:42,height:42,borderRadius:14,backgroundColor:"#edf6f8",alignItems:"center",justifyContent:"center"},attachText:{fontSize:25,color:"#447C99",fontWeight:"700"},inputTouchArea:{flex:1,minHeight:44,maxHeight:112,borderWidth:1,borderColor:"#cfe1e8",borderRadius:14,backgroundColor:"#fbfdfe",justifyContent:"center"},input:{width:"100%",minHeight:42,maxHeight:110,paddingHorizontal:12,paddingTop:11,paddingBottom:9,color:"#294b5d",fontSize:14,fontWeight:"600",backgroundColor:"transparent"},sendButton:{height:42,paddingHorizontal:15,borderRadius:14,backgroundColor:"#447C99",alignItems:"center",justifyContent:"center"},sendButtonDisabled:{opacity:.45},sendText:{color:"#fff",fontWeight:"900"},fileBar:{flexDirection:"row",alignItems:"center",paddingHorizontal:14,paddingVertical:8,backgroundColor:"#edf6f8"},fileName:{flex:1,fontSize:11,color:"#527489",fontWeight:"700"},removeFile:{fontSize:22,color:"#7b5960",fontWeight:"900",paddingHorizontal:8},
  modalOverlay:{flex:1,backgroundColor:"#17334499",justifyContent:"center",padding:20},modalCard:{backgroundColor:"#fcfeff",borderRadius:22,padding:18,maxHeight:"78%"},modalTitle:{fontSize:20,fontWeight:"900",color:"#24566d"},close:{fontSize:30,color:"#587687",fontWeight:"600",paddingHorizontal:6},subjectInput:{borderWidth:1,borderColor:"#cee2e9",borderRadius:12,padding:12,marginTop:14,color:"#294b5d"},recipientLabel:{fontSize:12,fontWeight:"900",color:"#567487",marginTop:15,marginBottom:7,textTransform:"uppercase"},contactsList:{maxHeight:340,marginBottom:14},contactRow:{flexDirection:"row",alignItems:"center",padding:10,borderRadius:14,borderWidth:1,borderColor:"#e1edf1",marginBottom:8},contactSelected:{backgroundColor:"#e8f6fa",borderColor:"#69aec1"},avatarSmall:{width:40,height:40,borderRadius:14,backgroundColor:"#e3f2f5",alignItems:"center",justifyContent:"center",marginRight:10},avatarSmallText:{fontWeight:"900",color:"#2d6b82"},contactName:{fontSize:14,fontWeight:"900",color:"#294f62"},contactRole:{fontSize:10,color:"#78909d",fontWeight:"700",marginTop:3,textTransform:"capitalize"},
  quickAssistFloat:{position:"absolute",right:18,bottom:18,width:84,height:84,borderRadius:42,backgroundColor:"#447C99",borderWidth:2,borderColor:"#d7eef3",alignItems:"center",justifyContent:"center",padding:10,zIndex:1000,elevation:18,shadowColor:"#24566d",shadowOffset:{width:0,height:8},shadowOpacity:.18,shadowRadius:16},
  quickAssistTouch:{width:"100%",height:"100%",borderRadius:37,alignItems:"center",justifyContent:"center"},
  quickAssistIconWrap:{width:52,height:52,borderRadius:26,backgroundColor:"#e7f6f8",borderWidth:1,borderColor:"#c8e4f5",alignItems:"center",justifyContent:"center"},
  quickAssistIcon:{width:30,height:30,tintColor:"#24566d"},
});
