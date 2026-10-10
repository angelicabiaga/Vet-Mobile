import { Platform, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#f7fbfc',
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
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
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },

  logoWrap: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  headerLogo: {
    width: 48,
    height: 48,
  },

  backButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  backIcon: {
    width: 18,
    height: 18,
    tintColor: '#ffffff',
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
    fontSize: 12,
    fontWeight: '700',
    color: '#c3ddee',
    marginTop: 3,
  },

  notifButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
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

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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

  profileIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  profileButtonImage: {
    width: '100%',
    height: '100%',
  },

  headerNotificationToast: {
    position: 'absolute',
    top: 72,
    right: 22,
    width: 210,
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dceef8',
    ...Platform.select({
      ios: {
        shadowColor: '#2c6ba3',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  headerNotificationText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#123a5e',
  },

  headerNotificationPointer: {
    position: 'absolute',
    top: -8,
    right: 16,
    width: 16,
    height: 16,
    backgroundColor: '#f8fcff',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#dceef8',
    transform: [{ rotate: '45deg' }],
  },

  headerBottomRow: {
    marginTop: 14,
    paddingTop: 0,
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerBottomRowWrap: {
    overflow: 'hidden',
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

  ownerBadge: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    marginLeft: 12,
  },

  ownerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
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

  heroCard: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 22,
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#3a7ab8',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  heroEyebrow: {
    color: '#dbeaf5',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },

  heroTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 32,
  },

  heroDescription: {
    color: '#edf7fc',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: '95%',
    fontWeight: '500',
  },

  sectionHeaderWrap: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#123a5e',
  },

  sectionSubtitle: {
    fontSize: 12,
    color: '#5f7f8a',
    marginTop: 3,
    fontWeight: '600',
  },

  petListCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#3a7ab8',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  searchBarWrap: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  searchBarIcon: {
    width: 19,
    height: 19,
    tintColor: '#5f7f94',
    marginRight: 10,
  },

  searchBarInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 14,
    fontWeight: '700',
    color: '#123a5e',
  },

  searchEmptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 12,
  },

  searchEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#123a5e',
    marginBottom: 6,
  },

  searchEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#5f7f94',
  },

  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  petRowActive: {
    backgroundColor: '#2c6ba3',
    borderColor: '#2c6ba3',
  },

  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  petAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#123a5e',
  },

  petAvatarImage: {
    width: 28,
    height: 28,
    tintColor: '#123a5e',
  },

  petAvatarImageCustom: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    tintColor: undefined,
  },

  petRowContent: {
    flex: 1,
  },

  petRowName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#123a5e',
  },

  petRowNameActive: {
    color: '#ffffff',
  },

  petRowBreed: {
    fontSize: 12,
    fontWeight: '700',
    color: '#68869c',
    marginTop: 4,
  },

  petRowBreedActive: {
    color: '#d6eaf7',
  },

  petStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e8f4fb',
    borderWidth: 1,
    borderColor: '#d4e9f6',
  },

  petStatusPillActive: {
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderColor: 'rgba(222, 242, 247, 0.3)',
  },

  petStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#123a5e',
  },

  petStatusTextActive: {
    color: '#ffffff',
  },

  addPetButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b7d9eb',
    backgroundColor: '#eef8ff',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },

  addPetPlus: {
    fontSize: 20,
    fontWeight: '900',
    color: '#123a5e',
    marginRight: 8,
  },

  addPetText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#123a5e',
  },

  emptyModeCard: {
    backgroundColor: '#eef8ff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d5ebf8',
    marginBottom: 20,
  },

  emptyModeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#123a5e',
    marginBottom: 6,
  },

  emptyModeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5f7f94',
    fontWeight: '600',
  },

  detailCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#3a7ab8',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  detailTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  secondaryActionButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#e8eef3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  secondaryActionButtonWide: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#e8eef3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  secondaryActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#49687a',
  },

  primaryActionButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#2c6ba3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryActionButtonWide: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#2c6ba3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },

  editActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  viewProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  largePetAvatar: {
    width: 82,
    height: 82,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  largePetAvatarText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#123a5e',
  },

  largePetAvatarImage: {
    width: 48,
    height: 48,
    tintColor: '#123a5e',
  },

  largePetAvatarImageCustom: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    tintColor: undefined,
  },

  viewProfileInfo: {
    flex: 1,
  },

  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#123a5e',
  },

  profileBreed: {
    fontSize: 13,
    fontWeight: '700',
    color: '#67869b',
    marginTop: 4,
  },

  referenceCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5f7f94',
    marginTop: 8,
  },

  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  profileInfoItem: {
    width: '48%',
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  profileInfoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  profileInfoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#123a5e',
  },

  innerSectionCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e3f2fb',
    marginTop: 12,
  },

  recordCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#123a5e',
    marginBottom: 10,
  },

  recordCardSectionSpacing: {
    marginTop: 10,
  },

  recordListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  recordBullet: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#2c6ba3',
    marginTop: 6,
    marginRight: 10,
  },

  recordItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#5f7f94',
    fontWeight: '600',
  },

  emptyRecordText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7a95a7',
    fontWeight: '600',
  },

  visitTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  visitTimelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2c6ba3',
    marginTop: 5,
    marginRight: 12,
  },

  visitTimelineContent: {
    flex: 1,
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  visitTimelineText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#123a5e',
    fontWeight: '700',
  },

  editPhotoSection: {
    alignItems: 'center',
    marginBottom: 18,
  },

  editAvatarWrap: {
    position: 'relative',
    marginBottom: 4,
  },

  photoPickerLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    color: '#123a5e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  avatarAddButton: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2c6ba3',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarAddButtonText: {
    fontSize: 21,
    lineHeight: 21,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: -1,
  },

  formCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e3f2fb',
  },

  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6a8aa0',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  requiredMark: {
    color: '#d84343',
    fontWeight: '900',
  },

  optionalMark: {
    color: '#87a0b1',
    fontWeight: '600',
  },

  readOnlyField: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#edf5fa',
    borderWidth: 1,
    borderColor: '#dae8f0',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  readOnlyFieldText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#49687a',
  },

  inputField: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#123a5e',
  },

  textAreaField: {
    minHeight: 108,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 14,
    paddingTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#123a5e',
  },

  pickerFieldWrap: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  enhancedFieldCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 12,
  },

  dropdownShell: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  searchableDropdown: {
    minHeight: 50,
  },

  searchableDropdownContainer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },

  dropdownPlaceholder: {
    fontSize: 14,
    fontWeight: '700',
    color: '#87a0b1',
  },

  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#123a5e',
  },

  dropdownItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#123a5e',
  },

  dropdownIcon: {
    width: 18,
    height: 18,
  },

  inlineFieldHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5f7f94',
  },

  stackedInputField: {
    marginTop: 12,
  },

  birthdayFieldCard: {
    backgroundColor: '#eff8ff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfe6f5',
    padding: 14,
  },

  birthdayInfoText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5f7f94',
    marginBottom: 12,
  },

  calendarTriggerButton: {
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  calendarTriggerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  calendarTriggerValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#123a5e',
  },

  calendarTriggerIconImage: {
    width: 26,
    height: 26,
    tintColor: '#123a5e',
  },

  birthdayAgeSummary: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  birthdayAgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  birthdayAgeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#123a5e',
  },

  birthdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  birthdayPickerWrap: {
    width: '44%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  birthdayPickerWrapSmall: {
    width: '26%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  birthdayPicker: {
    color: '#123a5e',
  },

  photoOptionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },

  photoOptionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#123a5e',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 18, 28, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  modalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dbeef8',
    ...Platform.select({
      ios: {
        shadowColor: '#2c6ba3',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  calendarModalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dbeef8',
    ...Platform.select({
      ios: {
        shadowColor: '#2c6ba3',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#123a5e',
    marginBottom: 10,
    textAlign: 'center',
  },

  modalMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5d7b91',
    fontWeight: '600',
    textAlign: 'center',
  },

  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },

  modalSecondaryButton: {
    width: '48%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eaf1f6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f6a7b',
  },

  modalPrimaryButton: {
    width: '48%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#2c6ba3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },

  modalSingleButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#2c6ba3',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },

  modalSingleButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },

  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 2,
  },

  calendarNavButton: {
    minWidth: 82,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#e8f2f9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  calendarNavButtonDisabled: {
    opacity: 0.45,
  },

  calendarNavButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#123a5e',
  },

  calendarTitleWrap: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },

  calendarActiveMonth: {
    fontSize: 15,
    fontWeight: '900',
    color: '#123a5e',
    marginBottom: 8,
    textAlign: 'center',
  },

  calendarPickerWrapYear: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  calendarPickerDropdown: {
    minHeight: 46,
  },

  // Year box: tap to swap the day grid for the year grid.
  calendarYearToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  calendarYearChevron: {
    fontSize: 10,
    color: '#5f7f94',
    marginLeft: 8,
  },

  // Year grid: same footprint as the day grid, scrolls inside the calendar card.
  calendarYearGridScroll: {
    maxHeight: 300,
    marginBottom: 18,
  },

  calendarYearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  calendarYearCell: {
    width: '31%',
    height: 46,
    marginVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  calendarWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  calendarWeekLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },

  calendarDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  calendarDayCellEmpty: {
    backgroundColor: 'transparent',
  },

  calendarDayCellDisabled: {
    backgroundColor: '#eef3f7',
  },

  calendarDayCellSelected: {
    backgroundColor: '#2c6ba3',
  },

  calendarDayText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#123a5e',
  },

  calendarDayTextEmpty: {
    color: 'transparent',
  },

  calendarDayTextDisabled: {
    color: '#aabac6',
  },

  calendarDayTextSelected: {
    color: '#ffffff',
  },

  calendarDonePlaceholder: {
    width: '48%',
    minHeight: 48,
  },

  bottomNav: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2c6ba3',
    borderWidth: 2,
    borderColor: '#d7eef3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#2c6ba3',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  navItem: {
    width: '100%',
    height: '100%',
    borderRadius: 37,
    justifyContent: 'center',
    alignItems: 'center',
  },

  activeNavItem: {
    backgroundColor: 'transparent',
  },

  navIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e7f6f8',
    borderWidth: 1,
    borderColor: '#c8e4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  activeNavIconWrap: {
    backgroundColor: '#e7f6f8',
  },

  navIcon: {
    width: 24,
    height: 24,
    tintColor: '#123a5e',
  },

  activeNavIcon: {
    tintColor: '#123a5e',
  },

  navLabel: {
    display: 'none',
  },

  activeNavLabel: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // --- Animal Patients list card ---
  patientCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 16,
    marginBottom: 14,
  },
  patientCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientPhoto: {
    width: 60,
    height: 60,
    borderRadius: 18,
    marginRight: 13,
    backgroundColor: '#e7f6f8',
  },
  patientPhotoFallback: {
    width: 60,
    height: 60,
    borderRadius: 18,
    marginRight: 13,
    backgroundColor: '#e7f6f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientPhotoFallbackText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#123a5e',
  },
  patientInfo: {
    flex: 1,
  },
  patientTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  patientName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#123a5e',
    marginRight: 8,
  },
  patientSpeciesBreed: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5f7f94',
  },
  patientMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e3f2fb',
  },
  patientMetaItem: {
    width: '50%',
    marginBottom: 8,
  },
  patientMetaLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7892a0',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  patientMetaValue: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#123a5e',
  },
  patientCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  viewProfileChip: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#2c6ba3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfileChipText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#ffffff',
  },

  // --- Status / health badges (shared: list card + profile header) ---
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusBadgeNeutral: { backgroundColor: '#e8f4fb' },
  statusBadgeNeutralText: { color: '#2c6ba3' },
  statusBadgeGood: { backgroundColor: '#e5f4ea' },
  statusBadgeGoodText: { color: '#2f8f5b' },
  statusBadgeWarn: { backgroundColor: '#fdf1dc' },
  statusBadgeWarnText: { color: '#a5680b' },
  statusBadgeRisk: { backgroundColor: '#fbe6e4' },
  statusBadgeRiskText: { color: '#c0392b' },
  statusBadgeArchived: { backgroundColor: '#eef1f4' },
  statusBadgeArchivedText: { color: '#64748b' },

  // --- Archive: list toggle, restore chip, edit-screen button ---
  archiveFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  speciesFilterShell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
  },
  speciesFilterDropdown: {
    minHeight: 42,
  },
  resultSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },
  paginationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  pageButton: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonActive: {
    backgroundColor: '#2c6ba3',
    borderColor: '#2c6ba3',
  },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  pageButtonTextActive: { color: '#ffffff' },
  archiveFilterSummary: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#6a8aa0',
  },
  archiveToggle: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveToggleActive: {
    backgroundColor: '#2c6ba3',
    borderColor: '#2c6ba3',
  },
  archiveToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  archiveToggleTextActive: { color: '#ffffff' },
  restoreChip: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#e5f4ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreChipText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#2f8f5b',
  },
  archivePetButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f3c4c0',
    backgroundColor: '#fdf2f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archivePetButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#c0392b',
  },

  // --- Animal Patient Profile header ---
  patientIdText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#5f7f94',
  },
  ownerInfoCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  ownerInfoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7892a0',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  ownerInfoValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#123a5e',
  },
  ownerInfoSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#5f7f94',
  },

  // --- Tabs ---
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#eef6fb',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  tabButtonActive: {
    backgroundColor: '#2c6ba3',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5f7f94',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },

  // --- Medical History: consultation cards ---
  consultationCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e3f2fb',
    padding: 15,
    marginBottom: 12,
  },
  consultationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  consultationHeaderMain: {
    flex: 1,
    paddingRight: 10,
  },
  consultationTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  latestBadge: {
    backgroundColor: '#2c6ba3',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginRight: 8,
    marginBottom: 4,
  },
  latestBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  consultationDateText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#5f7f94',
    marginBottom: 4,
  },
  consultationTitleText: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#123a5e',
  },
  consultationSubLine: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#68869c',
  },
  consultationBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  recordStatusBadge: {
    backgroundColor: '#e8f4fb',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  recordStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  chevronButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#eef6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2c6ba3',
  },
  consultationExpandedBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#edf4f8',
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#7892a0',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '700',
    color: '#123a5e',
  },
  fieldRow2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  fieldCol: {
    width: '50%',
    paddingHorizontal: 6,
  },

  // --- Per-consultation Billing / Prescriptions ---
  billingCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fbfdfe',
    borderWidth: 1,
    borderColor: '#e1edf2',
  },
  billingHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  billingHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  billingTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 13,
    fontWeight: '900',
    color: '#17445a',
  },
  billingRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef6fb',
  },
  billingRefreshText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  billingMutedText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#7892a0',
  },
  billingErrorText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#c0392b',
  },
  billingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#edf4f8',
    gap: 10,
  },
  billingRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  billingRowMain: {
    flex: 1,
  },
  billingRowTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#123a5e',
  },
  billingRowMeta: {
    marginTop: 3,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#68869c',
  },
  billingRowSig: {
    marginTop: 3,
    fontSize: 11.5,
    fontWeight: '600',
    fontStyle: 'italic',
    color: '#7892a0',
  },
  billingStatusPill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#e8f4fb',
  },
  billingStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2c6ba3',
  },
  billingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#2c6ba3',
  },
  billingActionButtonText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  rxHistoryList: {
    marginTop: 6,
  },
  rxHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rxHistoryText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#8aa2b4',
  },
  printButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cee2e9',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  printButtonDisabled: {
    opacity: 0.5,
  },
  printButtonText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#2c6ba3',
  },

  // --- Per-consultation AI Health Insight subsection ---
  aiInsightToggle: {
    minHeight: 44,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: '#f2f9fc',
    borderWidth: 1,
    borderColor: '#d8ebf3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  aiInsightToggleLabel: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#17445a',
  },
  aiInsightPanel: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fbfdfe',
    borderWidth: 1,
    borderColor: '#e1edf2',
  },
  aiSectionBlock: {
    marginBottom: 12,
  },
  aiSectionLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#17445a',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  aiBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  aiBulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4da8da',
    marginTop: 7,
    marginRight: 8,
  },
  aiBulletText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#324a54',
    fontWeight: '600',
  },
  aiCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  aiCheckMark: {
    width: 15,
    height: 15,
    borderRadius: 5,
    backgroundColor: '#e5f4ea',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    marginRight: 8,
  },
  aiCheckMarkText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#2f8f5b',
  },
  aiRiskRow: {
    marginBottom: 7,
  },
  aiRiskName: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#8a5a00',
  },
  aiRiskDetail: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4a3c22',
    lineHeight: 18,
  },
  aiMutedText: {
    fontSize: 12,
    color: '#93a4ac',
    lineHeight: 18,
  },
  aiDisclaimer: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f5f7f8',
  },
  aiDisclaimerText: {
    fontSize: 10.5,
    fontStyle: 'italic',
    color: '#5a747e',
    lineHeight: 15,
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  aiLoadingText: {
    marginLeft: 10,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#375864',
  },
  aiErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff0f0',
    borderRadius: 12,
    padding: 12,
  },
  aiErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#a94444',
    fontWeight: '700',
    marginRight: 10,
  },
  aiRetryButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiRetryText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#a94444',
  },
  riskBadgeSmall: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  riskBadgeSmallText: {
    fontSize: 10.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  // --- AI Predictive Health tab ---
  aiHealthSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 6,
  },
  aiSummaryCard: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  aiSummaryCardInner: {
    backgroundColor: '#fbfdfe',
    borderWidth: 1,
    borderColor: '#e1edf2',
    borderRadius: 16,
    padding: 14,
    minHeight: 96,
  },
  aiSummaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7a8d96',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  aiSummaryValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#213944',
  },
  aiSummaryCaption: {
    marginTop: 3,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#5a747e',
  },
  ringCard: {
    alignItems: 'center',
    backgroundColor: '#fbfdfe',
    borderWidth: 1,
    borderColor: '#e1edf2',
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 14,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringScoreValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#213944',
  },
  ringScoreMax: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a4b4bb',
  },
  ringCaption: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#5a747e',
  },
  aiCard: {
    backgroundColor: '#fbfdfe',
    borderWidth: 1,
    borderColor: '#e1edf2',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  aiCardTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#17445a',
    marginBottom: 3,
  },
  aiCardSubtitle: {
    fontSize: 11.5,
    color: '#7a8d96',
    fontWeight: '600',
    marginBottom: 12,
  },
  patternRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef3f5',
  },
  patternDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  patternDateText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#4c6470',
    marginRight: 8,
  },
  patternBadgeMini: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  patternBadgeMiniText: {
    fontSize: 9.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  patternBody: {
    fontSize: 13,
    fontWeight: '700',
    color: '#213944',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#fff3e0',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8a5a00',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2c6ba3',
    marginTop: 6,
    marginRight: 8,
  },
  upcomingText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2f6b45',
    lineHeight: 18,
  },
  preventiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f4fbff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  preventiveLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#123a5e',
  },
  preventiveSub: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#5f7f94',
  },
  aiEmptyCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fbfdfe',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1edf2',
  },
  aiEmptyText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#7a8d96',
    textAlign: 'center',
  },
  aiNotConfiguredText: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
    color: '#7a8d96',
    textAlign: 'center',
  },
});
