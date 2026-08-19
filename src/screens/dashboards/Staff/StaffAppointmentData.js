const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Real appointments.status is only ever one of these three values — there is
// no Pending/Rescheduled approval workflow on the backend. Every booking
// (staff- or owner-initiated) is created already-Confirmed.
const SLOT_STATUS = {
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

const SLOT_STATUS_META = {
  [SLOT_STATUS.CONFIRMED]: {
    label: 'Confirmed',
    color: '#2f80ed',
    background: '#ebf3ff',
    border: '#c6dbff',
  },
  [SLOT_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: '#d9534f',
    background: '#ffeceb',
    border: '#f4c2bf',
  },
  [SLOT_STATUS.COMPLETED]: {
    label: 'Completed',
    color: '#179c97',
    background: '#e7f8f7',
    border: '#bce8e6',
  },
};

const LEGEND_ITEMS = [
  { key: SLOT_STATUS.CONFIRMED, label: 'Confirmed', color: '#2f80ed' },
  { key: SLOT_STATUS.CANCELLED, label: 'Cancelled', color: '#d9534f' },
  { key: SLOT_STATUS.COMPLETED, label: 'Completed', color: '#179c97' },
];

const HEADER_MENU_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: require('../../assets/Dashboard_Icon.png'),
    route: 'staff-screen',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    icon: require('../../assets/Appointment_Icon.png'),
    route: 'StaffAppointment',
  },
  {
    key: 'mypets',
    label: 'Pets Profile',
    icon: require('../../assets/Pets_Icon.png'),
    route: 'StaffPetsProfile',
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: require('../../assets/Message_Icon.png'),
    route: 'StaffMessages',
  },
  {
    icon: require('../../assets/Inventory_Icon.png'),
    route: 'StaffInventory',
  },
  {
    key: 'user-management',
    label: 'User Management',
    icon: require('../../assets/UserManagement_Icon.png'),
    route: 'StaffUserManagement',
  },
  {
    key: 'payment-history',
    label: 'Payment History',
    icon: require('../../assets/payment_icon.png'),
    route: 'StaffPayHis',
  },
  {
    key: 'activity-logs',
    label: 'Activity Logs',
    icon: require('../../assets/Log_Icon.png'),
    route: 'StaffActivityLogs',
  },
];

const createDateKey = (year, monthIndex, day) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const toDateKey = (date) =>
  createDateKey(date.getFullYear(), date.getMonth(), date.getDate());

const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatFullDate = (dateKey) => {
  const date = fromDateKey(dateKey);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const TODAY = new Date();
const TODAY_DATE_KEY = toDateKey(TODAY);
const INITIAL_MONTH = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

const getSlotStatusKeyForAppointment = (status) => {
  const normalized = String(status || '').toLowerCase();
  return SLOT_STATUS_META[normalized] ? normalized : SLOT_STATUS.CONFIRMED;
};

const getReadableStatus = (status) => {
  const slotStatus = getSlotStatusKeyForAppointment(status);
  return SLOT_STATUS_META[slotStatus]?.label || status;
};

// Maps a real `appointments` row (as returned by getAllAppointments /
// getOwnerAppointments, with owner/pet/veterinarian/creator joined) into the
// flat field names the Staff appointment screens render.
const toAppointmentViewModel = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  ownerName: row.owner?.full_name || row.owner?.username || 'Pet Owner',
  petId: row.pet_id,
  petName: row.pet?.pet_name || 'Pet',
  petBreed: row.pet?.breed || '',
  referenceCode: String(row.id || '').slice(0, 8).toUpperCase(),
  veterinarianId: row.veterinarian_id,
  veterinarian: row.veterinarian?.full_name || 'Unassigned',
  bookingType: row.appointment_source || 'Online',
  dateKey: row.appointment_date,
  time: row.start_time,
  reason: row.visit_reason || 'No visit reason attached',
  status: row.status,
  cancellationReason: row.status === 'Cancelled' ? (row.notes || '') : '',
  lastUpdate: row.updated_at || row.created_at,
  creatorName: row.creator?.full_name || row.creator?.username || '',
});

const getDaySummary = (dateKey, appointments) => {
  const dayAppointments = appointments.filter((item) => item.dateKey === dateKey);
  const confirmed = dayAppointments.filter((item) => item.status === 'Confirmed').length;
  const cancelled = dayAppointments.filter((item) => item.status === 'Cancelled').length;
  const completed = dayAppointments.filter((item) => item.status === 'Completed').length;

  let tone = SLOT_STATUS.CONFIRMED;
  if (!dayAppointments.length) tone = null;
  else if (confirmed) tone = SLOT_STATUS.CONFIRMED;
  else if (completed) tone = SLOT_STATUS.COMPLETED;
  else if (cancelled) tone = SLOT_STATUS.CANCELLED;

  return {
    total: dayAppointments.length,
    confirmed,
    cancelled,
    completed,
    tone,
  };
};

const buildCalendarCells = (visibleMonthDate, appointments) => {
  const year = visibleMonthDate.getFullYear();
  const monthIndex = visibleMonthDate.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = createDateKey(year, monthIndex, day);

    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      summary: getDaySummary(dateKey, appointments),
      isToday: dateKey === TODAY_DATE_KEY,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

export {
  MONTH_NAMES,
  WEEK_LABELS,
  SLOT_STATUS,
  SLOT_STATUS_META,
  LEGEND_ITEMS,
  HEADER_MENU_ITEMS,
  TODAY_DATE_KEY,
  INITIAL_MONTH,
  createDateKey,
  fromDateKey,
  formatFullDate,
  getSlotStatusKeyForAppointment,
  getReadableStatus,
  toAppointmentViewModel,
  getDaySummary,
  buildCalendarCells,
};
