import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from '../screens/dashboards/PetOwner/PetOwnerBottomNav';
import VetBottomNav from '../screens/dashboards/Veterinary/VetBottomNav';
import PetOwnerHeaderGreeting from '../screens/dashboards/PetOwner/PetOwnerHeaderGreeting';
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
  MESSAGE_MAX_LENGTH, ATTACHMENT_MAX_BYTES, validateMessage,
} from "../api/messageService";

const normalizeRole = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
const DEFAULT_PROFILE_IMAGE = require("../screens/assets/Profile.png");

export default function MobileMessagingScreen({ navigation, route, allowedRoles = [], title = "Messages", backRoute }) {
  const profile = route?.params?.user || {};
  // Set when opened from a message notification: open that chat once loaded.
  const requestedConversationId = route?.params?.conversationId || null;
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
  // Shown above the composer; Alert.alert is a no-op on web, so send failures need on-screen text.
  const [sendError, setSendError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [subject, setSubject] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
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
      subtitle: "Messages",
      sideDrawerRole: "veterinarian",
      headerMenuItems: [
        { key: "dashboard", label: "Dashboard", icon: require("../screens/assets/Dashboard_Icon.png"), route: "vet-screen" },
        { key: "patients", label: "Animal Patients", icon: require("../screens/assets/Pets_Icon.png"), route: "VetPatientOwners" },
        { key: "appointments", label: "Appointments", icon: require("../screens/assets/Appointment_Icon.png"), route: "VetAppointment" },
        { key: "messages", label: "Messages", icon: require("../screens/assets/Message_Icon.png"), route: "VetMessages" },
      ],
    },
    pet_owner: {
      dashboardRoute: "petowner-screen",
      notificationRoute: "PetOwnerNotif",
      profileRoute: "PetOwnerProfile",
      showQuickAssist: true,
      subtitle: "Messages",
      sideDrawerRole: "pet_owner",
      headerMenuItems: [
        { key: "dashboard", label: "Dashboard", icon: require("../screens/assets/Dashboard_Icon.png"), route: "petowner-screen" },
        { key: "appointment", label: "Appointment", icon: require("../screens/assets/Appointment_Icon.png"), route: "PetOwnerAppointment" },
        { key: "queue", label: "Queue", icon: require("../screens/assets/List.png"), route: "PetOwnerQueue" },
        { key: "mypets", label: "Animal Patients", icon: require("../screens/assets/Pets_Icon.png"), route: "PetOwnerMyPets" },
        { key: "messages", label: "Messages", icon: require("../screens/assets/Message_Icon.png"), route: "PetOwnerMessages" },
      ],
    },
  };

  const roleMeta = ROLE_META[currentRole] || ROLE_META.pet_owner;
  const { headerMenuItems } = roleMeta;
  // Both roles navigate with their own bottom tab bar.
  const isPetOwner = roleMeta.sideDrawerRole === "pet_owner";

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

  const openedRequestRef = useRef(null);
  useEffect(() => {
    if (!requestedConversationId || openedRequestRef.current === requestedConversationId) return;
    const match = conversations.find((c) => c.id === requestedConversationId || c.conversationIds?.includes(requestedConversationId));
    if (!match) return;
    openedRequestRef.current = requestedConversationId;
    setActiveConversation(match);
  }, [requestedConversationId, conversations]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    const stopLive = subscribeToMessagingOverview(profile.id, () => {
      if (active) loadOverview();
    });
    const fallbackTimer = setInterval(() => {
      if (active) loadOverview();
    }, 5000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      stopLive();
    };
  }, [profile?.id, loadOverview]);


  // Background refreshes (realtime, polling, after sending) stay silent: the
  // spinner shows only on a conversation's first load, and the list scrolls
  // only when a new message arrives.
  // A merged row covers every thread with the same people; send goes to the newest (`id`).
  const activeKey = (activeConversation?.conversationIds || [activeConversation?.id]).filter(Boolean).join(",");
  const loadedConversationRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const loadingActiveRef = useRef(false);
  const activeKeyRef = useRef(activeKey);
  const loadActive = useCallback(async () => {
    if (!activeKey || !profile?.id || loadingActiveRef.current === activeKey) return;
    const conversationId = activeKey;
    const threadIds = activeKey.split(",");
    const firstLoad = loadedConversationRef.current !== conversationId;
    loadingActiveRef.current = conversationId;
    try {
      if (firstLoad) setMessagesLoading(true);
      const rows = (await getMessages(threadIds)) || [];
      // The user switched or closed the chat while this was loading.
      if (activeKeyRef.current !== conversationId) return;
      const lastId = `${rows.length}:${rows[rows.length - 1]?.id ?? ''}`;
      const changed = firstLoad || lastId !== lastMessageIdRef.current;
      loadedConversationRef.current = conversationId;
      lastMessageIdRef.current = lastId;
      if (changed) {
        setMessages(rows);
        await markConversationRead(threadIds, profile.id);
        await loadOverview();
        requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: !firstLoad }));
      }
    } catch (error) {
      if (activeKeyRef.current !== conversationId) return;
      // Alert once; later polls retry quietly.
      if (firstLoad) Alert.alert("Messages", error.message || "Unable to load the conversation.");
      loadedConversationRef.current = conversationId;
    } finally {
      if (loadingActiveRef.current === conversationId) loadingActiveRef.current = false;
      if (firstLoad && activeKeyRef.current === conversationId) setMessagesLoading(false);
    }
  }, [activeKey, profile?.id, loadOverview]);

  useEffect(() => {
    // Each open starts fresh, including reopening the same chat.
    activeKeyRef.current = activeKey;
    loadedConversationRef.current = null;
    lastMessageIdRef.current = null;
    setMessages([]);
    setMessagesLoading(false);
    setSendError("");
    if (!activeKey) return undefined;

    let active = true;
    loadActive();

    const stopLive = subscribeToMessages(activeKey.split(","), async () => {
      if (active) await loadActive();
    });
    const fallbackTimer = setInterval(async () => {
      if (active) await loadActive();
    }, 3000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      stopLive();
    };
  }, [activeKey, loadActive]);

  const otherParticipantsFor = (conversation) =>
    (conversation?.participants || []).filter((p) => p.id !== profile.id);

  // The other person's profile photo (one-to-one chats), or '' to show their initial.
  const avatarFor = (conversation) => {
    const others = otherParticipantsFor(conversation);
    return others.length === 1 ? String(others[0].avatar_url || '').trim() : '';
  };

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
    const sender = (conversation.participants || []).find((p) => p.id === latest.sender_id);
    const senderName = latest.sender_id === profile.id ? "You" : sender?.full_name || sender?.username || "PawCruz User";
    // A file on its own reads as an action, not a raw file name.
    if (!latest.body?.trim()) return `${senderName} sent an attachment`;
    return `${senderName}: ${latest.body}`;
  };

  // Clinic team (Admin, Staff) first, then everyone else; each group by name.
  const ROLE_ORDER = { admin: 0, administrator: 0, staff: 1, veterinarian: 2, pet_owner: 3 };
  const recipientQuery = recipientSearch.trim().toLowerCase();
  const visibleContacts = contacts
    .filter((contact) => !recipientQuery || [contact.full_name, contact.username, contact.email, roleLabel(contact.role)]
      .some((value) => String(value || "").toLowerCase().includes(recipientQuery)))
    .sort((a, b) => {
      const byRole = (ROLE_ORDER[normalizeRole(a.role)] ?? 9) - (ROLE_ORDER[normalizeRole(b.role)] ?? 9);
      if (byRole) return byRole;
      return String(a.full_name || a.username || "").localeCompare(String(b.full_name || b.username || ""));
    });

  const closeNew = () => { setShowNew(false); setRecipientSearch(""); };

  const createNew = async () => {
    if (!selectedContact?.id) return Alert.alert("New Conversation", "Choose a recipient first.");
    try {
      const conversation = await createConversation(profile, [selectedContact.id], subject || `Chat with ${selectedContact.full_name || "PawCruz"}`);
      closeNew(); setSelectedContact(null); setSubject("");
      await loadOverview();
      const refreshed = await getConversations(profile);
      setActiveConversation((refreshed || []).find((c) => c.id === conversation.id || c.conversationIds?.includes(conversation.id)) || conversation);
    } catch (error) {
      Alert.alert("New Conversation", error.message || "Unable to create conversation.");
    }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      const picked = result.assets?.[0];
      if (result.canceled || !picked) return;
      if (picked.size != null && picked.size > ATTACHMENT_MAX_BYTES) return setSendError("That file is larger than 25 MB, so it can't be sent.");
      setSendError("");
      setFile(picked);
    } catch (error) { Alert.alert("Attachment", "Unable to select that file."); }
  };

  const submit = async () => {
    if (!activeConversation?.id || sending) return;
    const invalid = validateMessage(body, file);
    if (invalid) return setSendError(`Message not sent: ${invalid}`);
    setSendError("");
    try {
      setSending(true);
      await sendMessage(activeConversation.id, profile, body, file);
      setBody(""); setFile(null);
      await loadActive();
    } catch (error) {
      setSendError(error.message || "Message not sent. Please try again.");
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
        <LinearGradient colors={["#3a7ab8", "#3a7ab8", "#3a7ab8"]} style={styles.dashboardHeader}>
          <LinearGradient colors={["#1e5a8c", "#256297", "#2c6ba3", "#3a7ab8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dashboardTopBand}>
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
                  <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.dashboardBottomRow}>
            <PetOwnerHeaderGreeting
              caption={activeConversation ? "Chatting with" : isPetOwner ? "Your clinic conversations" : "Talk to pet owners"}
              name={activeConversation ? titleFor(activeConversation) : undefined}
              user={profile}
            />
          </View>

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
            <Text style={styles.messagesToolbarTitle}>Messages</Text>
            <TouchableOpacity onPress={() => setShowNew(true)} style={styles.newConversationButton} activeOpacity={0.85}>
              <Text style={styles.newConversationButtonText}>＋</Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeConversation ? (
          loading ? <View style={styles.center}><ActivityIndicator size="large" color="#2c6ba3" /></View> :
          <FlatList
            data={conversations}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={conversations.length ? styles.listContent : styles.emptyContent}
            refreshing={loading}
            onRefresh={() => { setLoading(true); loadOverview(); }}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.emptyText}>Tap + to start a conversation.</Text><TouchableOpacity style={styles.primary} onPress={() => setShowNew(true)}><Text style={styles.primaryText}>Start Conversation</Text></TouchableOpacity></View>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.conversationCard} onPress={() => setActiveConversation(item)} activeOpacity={0.88}>
                <View style={styles.avatar}>{avatarFor(item) ? <Image source={{ uri: avatarFor(item) }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.avatarText}>{titleFor(item).charAt(0).toUpperCase()}</Text>}</View>
                <View style={styles.conversationBody}>
                  <View style={styles.row}><Text style={styles.conversationTitle} numberOfLines={1}>{titleFor(item)}</Text>{item.unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View> : null}</View>
                  <Text style={styles.roleText} numberOfLines={1}>{subtitleFor(item)}</Text>
                  <Text style={styles.preview} numberOfLines={1}>{previewFor(item)}</Text>
                  <Text style={styles.time}>{new Date(item.last_message_at || item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
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
            {messagesLoading ? <ActivityIndicator style={{ marginTop: 20 }} color="#2c6ba3" /> : null}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              removeClippedSubviews={false}
              // Render the whole chat so scrolling to the end reaches the newest
              // message; batch rendering stopped part-way and hid recent ones.
              initialNumToRender={Math.max(messages.length, 20)}
              maxToRenderPerBatch={Math.max(messages.length, 20)}
              windowSize={41}
              renderItem={({ item }) => {
                const mine = item.sender_id === profile.id;
                return <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  <Text style={[styles.sender, mine && styles.senderMine]}>{mine ? (profile.full_name || profile.fullName || profile.username || "You") : (item.sender?.full_name || "PawCruz User")}</Text>
                  {item.body ? <Text style={styles.messageText}>{item.body}</Text> : null}
                  {item.attachment_url ? <TouchableOpacity onPress={() => Linking.openURL(item.attachment_url)}><Text style={styles.attachment}>📎 {item.attachment_name || "Attachment"}</Text></TouchableOpacity> : null}
                  <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
                </View>;
              }}
              ListEmptyComponent={!messagesLoading ? <View style={styles.emptyChat}><Text style={styles.emptyText}>No messages yet. Say hello.</Text></View> : null}
            />
            {sendError ? <View style={styles.sendErrorBar}><Text style={styles.sendErrorText}>{sendError}</Text></View> : null}
            {file ? <View style={styles.fileBar}><Text style={styles.fileName} numberOfLines={1}>Attached: {file.name}</Text><TouchableOpacity onPress={() => setFile(null)}><Text style={styles.removeFile}>×</Text></TouchableOpacity></View> : null}
            <View style={styles.composer}>
              <TouchableOpacity style={styles.attachButton} onPress={pickAttachment} activeOpacity={0.8}>
                <Text style={styles.attachText}>＋</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                style={[styles.inputTouchArea, sendError && styles.inputTouchAreaError]}
                onPress={() => inputRef.current?.focus()}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={body}
                  onChangeText={(text) => { setBody(text); if (sendError) setSendError(""); }}
                  placeholder="Type a message..."
                  maxLength={MESSAGE_MAX_LENGTH}
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
                disabled={sending}
                activeOpacity={0.8}
              >
                <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Inside an open thread the bar steps aside (the thread has its own back
            button) so the conversation and composer get the full height. */}
        {activeConversation ? null : isPetOwner ? (
          <PetOwnerBottomNav navigation={navigation} user={profile} activeKey="messages" />
        ) : (
          <VetBottomNav navigation={navigation} user={profile} activeKey="messages" />
        )}

        <Modal visible={showNew} transparent animationType="fade" onRequestClose={closeNew}>
          <View style={styles.modalOverlay}><View style={styles.modalCard}>
            <View style={styles.row}><Text style={styles.modalTitle}>New Conversation</Text><TouchableOpacity onPress={closeNew}><Text style={styles.close}>×</Text></TouchableOpacity></View>
            <TextInput style={styles.subjectInput} value={subject} onChangeText={setSubject} placeholder="Subject (optional)" placeholderTextColor="#8aa0af" />
            <Text style={styles.recipientLabel}>Choose recipient</Text>
            <TextInput style={styles.recipientSearchInput} value={recipientSearch} onChangeText={setRecipientSearch} placeholder="Search name, email, or role (e.g. Staff)" placeholderTextColor="#8aa0af" autoCapitalize="none" />
            <FlatList data={visibleContacts} keyExtractor={(item) => String(item.id)} style={styles.contactsList}
              ListEmptyComponent={<Text style={styles.emptyText}>{recipientQuery ? "No recipients match your search." : "No active recipients found."}</Text>}
              renderItem={({ item }) => <TouchableOpacity style={[styles.contactRow, selectedContact?.id === item.id && styles.contactSelected]} onPress={() => setSelectedContact(item)}>
                <View style={styles.avatarSmall}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.avatarSmallText}>{(item.full_name || item.username || "U").charAt(0).toUpperCase()}</Text>}</View>
                <View style={{ flex: 1 }}><Text style={styles.contactName}>{item.full_name || item.username || item.email}</Text><Text style={styles.contactRole}>{roleLabel(item.role)}{item.email ? ` • ${item.email}` : ""}</Text></View>
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
  dashboardHeader:{marginHorizontal:0,marginTop:0,marginBottom:12,paddingHorizontal:22,paddingTop:18,paddingBottom:20,borderBottomLeftRadius:30,borderBottomRightRadius:30,shadowColor:"#2c6ba3",shadowOffset:{width:0,height:8},shadowOpacity:0.18,shadowRadius:14,elevation:8},
  dashboardTopBand:{marginHorizontal:-22,marginTop:-18,paddingHorizontal:22,paddingTop:18,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"rgba(230,246,250,0.24)"},
  dashboardTopRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  brandSection:{flexDirection:"row",alignItems:"center",flex:1,marginRight:12},
  logoWrap:{width:64,height:64,justifyContent:"center",alignItems:"center",marginRight:12},
  headerLogo:{width:48,height:48},
  brandBlock:{flex:1},
  brandTitle:{fontSize:28,fontWeight:"900",color:"#ffffff"},
  brandSubtitle:{fontSize:12,fontWeight:"700",color:"#c3ddee",marginTop:3},
  headerActions:{flexDirection:"row",alignItems:"center"},
  notifButton:{width:46,height:46,borderRadius:15,backgroundColor:"rgba(44, 107, 163,0.42)",borderWidth:1,borderColor:"rgba(222,242,247,0.34)",justifyContent:"center",alignItems:"center"},
  notifIcon:{width:21,height:21,tintColor:"#ffffff"},
  profileButton:{width:46,height:46,borderRadius:15,backgroundColor:"rgba(44, 107, 163,0.42)",borderWidth:1,borderColor:"rgba(222,242,247,0.34)",justifyContent:"center",alignItems:"center",marginLeft:10,overflow:"hidden"},
  profileIcon:{width:20,height:20,tintColor:"#ffffff"},
  profileButtonImage:{width:"100%",height:"100%"},
  dashboardBottomRow:{marginTop:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  menuTriggerButton:{width:58,height:58,borderRadius:18,backgroundColor:"rgba(44, 107, 163,0.36)",borderWidth:1,borderColor:"rgba(222,242,247,0.3)",justifyContent:"center",alignItems:"center"},
  menuTriggerIcon:{width:30,height:30,tintColor:"#ffffff"},
  ownerSummary:{flex:1,alignItems:"flex-end",marginLeft:12},
  headerCaption:{fontSize:12,color:"#b8d4e5",fontWeight:"700",textAlign:"right"},
  ownerName:{fontSize:18,fontWeight:"800",color:"#ffffff",marginTop:4,textAlign:"right",maxWidth:"78%"},
  headerMenuPanel:{marginTop:14,width:"100%",padding:14,borderRadius:28,backgroundColor:"rgba(44, 107, 163,0.98)",borderWidth:1,borderColor:"rgba(255,255,255,0.12)",alignSelf:"stretch"},
  headerMenuItem:{minHeight:58,borderRadius:18,backgroundColor:"rgba(255,255,255,0.22)",flexDirection:"row",alignItems:"center",paddingHorizontal:14,marginBottom:12},
  headerMenuItemActive:{backgroundColor:"rgba(255,255,255,0.34)",borderWidth:1,borderColor:"rgba(255,255,255,0.28)"},
  headerMenuItemIconWrap:{width:34,height:34,borderRadius:12,backgroundColor:"rgba(44, 107, 163,0.42)",justifyContent:"center",alignItems:"center",marginRight:14},
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
  conversationCard:{flexDirection:"row",backgroundColor:"#fcfeff",borderRadius:22,borderWidth:1,borderColor:"#d9eaf1",padding:14,marginBottom:12,shadowColor:"#214f67",shadowOpacity:.05,shadowRadius:10,elevation:2},avatar:{width:50,height:50,borderRadius:18,backgroundColor:"#e2f3f6",alignItems:"center",justifyContent:"center",marginRight:12,overflow:"hidden"},avatarImage:{width:"100%",height:"100%"},avatarText:{fontSize:20,fontWeight:"900",color:"#256297"},conversationBody:{flex:1},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},roleText:{fontSize:12,color:"#2c6ba3",fontWeight:"700",marginTop:2,marginBottom:2},conversationTitle:{flex:1,fontSize:15,fontWeight:"900",color:"#244f64",marginRight:8},preview:{fontSize:13,color:"#668092",fontWeight:"600",marginTop:5},time:{fontSize:10,color:"#8da1ad",fontWeight:"700",marginTop:7},badge:{minWidth:24,height:24,borderRadius:12,backgroundColor:"#2c6ba3",alignItems:"center",justifyContent:"center",paddingHorizontal:6},badgeText:{color:"#fff",fontSize:11,fontWeight:"900"},
  empty:{alignItems:"center"},emptyTitle:{fontSize:20,fontWeight:"900",color:"#123a5e"},emptyText:{fontSize:13,color:"#728a99",fontWeight:"600",textAlign:"center",marginTop:7,marginBottom:16},primary:{backgroundColor:"#2c6ba3",paddingVertical:13,paddingHorizontal:20,borderRadius:14,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},
  chatWrap:{flex:1},messagesContent:{padding:16,paddingBottom:20},bubble:{alignSelf:"flex-start",maxWidth:"82%",backgroundColor:"#fcfeff",borderRadius:18,borderTopLeftRadius:5,padding:12,marginBottom:10,borderWidth:1,borderColor:"#dfedf2"},bubbleMine:{alignSelf:"flex-end",backgroundColor:"#dff3f8",borderTopLeftRadius:18,borderTopRightRadius:5,borderColor:"#c6e5ed"},senderMine:{textAlign:"right",color:"#256297"},sender:{fontSize:10,fontWeight:"900",color:"#2c6ba3",marginBottom:4},messageText:{fontSize:14,lineHeight:20,color:"#294b5d",fontWeight:"600"},messageTime:{fontSize:9,color:"#8499a5",marginTop:6},attachment:{fontSize:13,color:"#217ba7",fontWeight:"800",marginTop:4},emptyChat:{paddingTop:80,alignItems:"center"},
  composer:{flexDirection:"row",alignItems:"flex-end",paddingHorizontal:14,paddingTop:10,paddingBottom:Platform.OS === "ios" ? 10 : 12,borderTopWidth:1,borderColor:"#dbeaf0",backgroundColor:"#fcfeff",gap:8,zIndex:20,elevation:20},attachButton:{width:42,height:42,borderRadius:14,backgroundColor:"#edf6f8",alignItems:"center",justifyContent:"center"},attachText:{fontSize:25,color:"#2c6ba3",fontWeight:"700"},inputTouchAreaError:{borderColor:"#dc2626"},inputTouchArea:{flex:1,minHeight:44,maxHeight:112,borderWidth:1,borderColor:"#cfe1e8",borderRadius:14,backgroundColor:"#fbfdfe",justifyContent:"center"},input:{width:"100%",minHeight:42,maxHeight:110,paddingHorizontal:12,paddingTop:11,paddingBottom:9,color:"#294b5d",fontSize:14,fontWeight:"600",backgroundColor:"transparent"},sendButton:{height:42,paddingHorizontal:15,borderRadius:14,backgroundColor:"#2c6ba3",alignItems:"center",justifyContent:"center"},sendButtonDisabled:{opacity:.45},sendText:{color:"#fff",fontWeight:"900"},sendErrorBar:{paddingHorizontal:14,paddingVertical:8,backgroundColor:"#fff1f1",borderTopWidth:1,borderColor:"#f4cccc"},sendErrorText:{fontSize:12.5,color:"#a33f3f",fontWeight:"700"},fileBar:{flexDirection:"row",alignItems:"center",paddingHorizontal:14,paddingVertical:8,backgroundColor:"#edf6f8"},fileName:{flex:1,fontSize:11,color:"#527489",fontWeight:"700"},removeFile:{fontSize:22,color:"#7b5960",fontWeight:"900",paddingHorizontal:8},
  modalOverlay:{flex:1,backgroundColor:"#17334499",justifyContent:"center",padding:20},modalCard:{backgroundColor:"#fcfeff",borderRadius:22,padding:18,maxHeight:"78%"},modalTitle:{fontSize:20,fontWeight:"900",color:"#123a5e"},close:{fontSize:30,color:"#587687",fontWeight:"600",paddingHorizontal:6},subjectInput:{borderWidth:1,borderColor:"#cee2e9",borderRadius:12,padding:12,marginTop:14,color:"#294b5d"},recipientLabel:{fontSize:12,fontWeight:"900",color:"#567487",marginTop:15,marginBottom:7,textTransform:"uppercase"},contactsList:{maxHeight:340,marginBottom:14},contactRow:{flexDirection:"row",alignItems:"center",padding:10,borderRadius:14,borderWidth:1,borderColor:"#e1edf1",marginBottom:8},contactSelected:{backgroundColor:"#e8f6fa",borderColor:"#69aec1"},avatarSmall:{width:40,height:40,borderRadius:14,backgroundColor:"#e3f2f5",alignItems:"center",justifyContent:"center",marginRight:10,overflow:"hidden"},avatarSmallText:{fontWeight:"900",color:"#2d6b82"},contactName:{fontSize:14,fontWeight:"900",color:"#294f62"},contactRole:{fontSize:10,color:"#78909d",fontWeight:"700",marginTop:3},recipientSearchInput:{borderWidth:1,borderColor:"#cee2e9",borderRadius:12,paddingHorizontal:12,paddingVertical:10,marginBottom:10,color:"#294b5d",backgroundColor:"#ffffff"},
  quickAssistFloat:{position:"absolute",right:18,bottom:18,width:84,height:84,borderRadius:42,backgroundColor:"#2c6ba3",borderWidth:2,borderColor:"#d7eef3",alignItems:"center",justifyContent:"center",padding:10,zIndex:1000,elevation:18,shadowColor:"#123a5e",shadowOffset:{width:0,height:8},shadowOpacity:.18,shadowRadius:16},
  quickAssistTouch:{width:"100%",height:"100%",borderRadius:37,alignItems:"center",justifyContent:"center"},
  quickAssistIconWrap:{width:52,height:52,borderRadius:26,backgroundColor:"#e7f6f8",borderWidth:1,borderColor:"#c8e4f5",alignItems:"center",justifyContent:"center"},
  quickAssistIcon:{width:30,height:30,tintColor:"#123a5e"},
});
