import React from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import VetShell, { getVetUser } from './VetShell';
import { formatTime, getVeterinarianAppointments } from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';

const ALLOWED = ['Confirmed', 'Completed', 'Cancelled'];
const STATUS_FILTERS = [
  { label: 'All Statuses', value: 'All' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
];
const PAGE_SIZE = 8;
const label = (value) => value || '—';
const getId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const formatDate = (value) => {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};
const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function VetAppointment({ navigation, route }) {
  const user = getVetUser(route);
  const veterinarianId = getId(user);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setError('');
      const data = await getVeterinarianAppointments(veterinarianId);
      setItems(data.filter((item) => ALLOWED.includes(item.status)));
    } catch (e) {
      setError(e.message || 'Unable to load assigned appointments.');
    } finally {
      setLoading(false);
    }
  }, [veterinarianId]);

  React.useEffect(() => {
    if (!veterinarianId) return undefined;

    let active = true;
    load();

    const channel = supabase
      .channel(`mobile-vet-appointments-${veterinarianId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `veterinarian_id=eq.${veterinarianId}`,
        },
        async () => {
          if (!active) return;
          await load();
        }
      )
      .subscribe();

    const fallbackTimer = setInterval(() => {
      if (active) load();
    }, 15000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      supabase.removeChannel(channel);
    };
  }, [veterinarianId, load]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All');
  };

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (statusFilter !== 'All' && item.status !== statusFilter) return false;
    if (!query) return true;
    return [
      item.pet?.pet_name,
      item.owner?.full_name,
      item.veterinarian?.full_name,
      item.consultation_type,
      item.visit_reason,
      item.status,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const hasActiveFilters = Boolean(search) || statusFilter !== 'All';
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <VetShell navigation={navigation} route={route} subtitle="Appointments" caption="Assigned clinic schedule">
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.helper}>Appointments use the same PawCruz web data and 10-minute scheduling flow. This veterinarian view is read-only; Staff controls appointment status and clinic check-in.</Text>

      <View style={styles.searchBar}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search pet, owner, veterinarian, reason"
            placeholderTextColor="#8aa2b4"
            value={search}
            onChangeText={setSearch}
          />
          {hasActiveFilters ? (
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters} activeOpacity={0.85}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Dropdown
          style={styles.dropdown}
          containerStyle={styles.dropdownList}
          data={STATUS_FILTERS}
          labelField="label"
          valueField="value"
          value={statusFilter}
          placeholder="Filter by status"
          selectedTextStyle={styles.dropdownSelectedText}
          placeholderStyle={styles.dropdownSelectedText}
          onChange={(item) => setStatusFilter(item.value)}
        />
      </View>

      {loading && !items.length ? <ActivityIndicator size="large" color="#2c6ba3" /> : null}
      {error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Appointments unavailable</Text><Text style={styles.emptyText}>{error}</Text></View> : null}
      {!loading && !error && !items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>No assigned appointments</Text><Text style={styles.emptyText}>Assigned appointments will appear here automatically.</Text></View> : null}
      {!loading && !error && items.length && !visibleItems.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>No matching appointments</Text><Text style={styles.emptyText}>Try a different search term or status filter.</Text></View> : null}

      {pagedItems.map((item) => <TouchableOpacity key={item.id} style={styles.listRow} onPress={() => setSelected(item)} activeOpacity={0.8}>
        <View style={styles.listRowTop}>
          <Text style={styles.pet} numberOfLines={1}>{label(item.pet?.pet_name)}</Text>
          <Text style={[styles.status, item.status === 'Cancelled' && styles.cancelled, item.status === 'Completed' && styles.completed]}>{item.status}</Text>
        </View>
        <Text style={styles.listMeta} numberOfLines={1}>{label(item.owner?.full_name)} • {formatDate(item.appointment_date)} • {formatTime(item.start_time)}–{formatTime(item.end_time)}</Text>
        {item.visit_reason || item.consultation_type ? (
          <Text style={styles.listReason} numberOfLines={1}>{label(item.consultation_type)}{item.visit_reason ? ` — ${item.visit_reason}` : ''}</Text>
        ) : null}
      </TouchableOpacity>)}

      {visibleItems.length > PAGE_SIZE ? (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, currentPage <= 1 && styles.pageButtonDisabled]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            activeOpacity={0.85}
          >
            <Text style={[styles.pageButtonText, currentPage <= 1 && styles.pageButtonTextDisabled]}>Previous</Text>
          </TouchableOpacity>
          <Text style={styles.pageIndicator}>Page {currentPage} of {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageButton, currentPage >= totalPages && styles.pageButtonDisabled]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            activeOpacity={0.85}
          >
            <Text style={[styles.pageButtonText, currentPage >= totalPages && styles.pageButtonTextDisabled]}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>

    <Modal transparent animationType="fade" visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{label(selected?.pet?.pet_name)}</Text>
              <Text style={[styles.status, selected?.status === 'Cancelled' && styles.cancelled, selected?.status === 'Completed' && styles.completed]}>{selected?.status}</Text>
            </View>
            <Info label="Pet Owner" value={label(selected?.owner?.full_name)} />
            <Info label="Veterinarian" value={label(selected?.veterinarian?.full_name)} />
            <Info label="Date" value={formatDate(selected?.appointment_date)} />
            <Info label="Start Time" value={formatTime(selected?.start_time)} />
            <Info label="End Time" value={formatTime(selected?.end_time)} />
            <Info label="Appointment Source" value={label(selected?.appointment_source)} />
            <Info label="Consultation Type" value={label(selected?.consultation_type)} />
            <Info label="Visit Reason" value={label(selected?.visit_reason)} />
            <Info label="Notes" value={label(selected?.notes)} />
            <Info label="Status" value={label(selected?.status)} />
            <Info label="Created By" value={label(selected?.creator?.full_name || selected?.creator?.username || selected?.created_by)} />
            <Info label="Created Date" value={formatTimestamp(selected?.created_at)} />
            <Info label="Updated Date" value={formatTimestamp(selected?.updated_at)} />
          </ScrollView>
          <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelected(null)} activeOpacity={0.9}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </VetShell>;
}

function Info({ label: title, value }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{title}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content:{padding:18,paddingBottom:110},
  helper:{backgroundColor:'#e9f6fa',borderRadius:18,padding:14,color:'#466d80',fontSize:12,lineHeight:18,fontWeight:'700',marginBottom:14},
  searchBar:{backgroundColor:'#fcfeff',borderRadius:18,borderWidth:1,borderColor:'#d7edf9',padding:12,marginBottom:14,gap:10},
  searchRow:{flexDirection:'row',alignItems:'center',gap:10},
  searchInput:{flex:1,minHeight:46,borderRadius:14,borderWidth:1,borderColor:'#d7edf9',backgroundColor:'#ffffff',paddingHorizontal:14,fontSize:14,fontWeight:'700',color:'#123a5e'},
  clearButton:{minHeight:46,paddingHorizontal:16,borderRadius:14,backgroundColor:'#eef4f8',alignItems:'center',justifyContent:'center'},
  clearButtonText:{color:'#2c6ba3',fontWeight:'900',fontSize:12},
  dropdown:{minHeight:46,borderWidth:1,borderColor:'#d7edf9',borderRadius:14,paddingHorizontal:14,backgroundColor:'#ffffff'},
  dropdownList:{borderRadius:14,borderColor:'#d7edf9'},
  dropdownSelectedText:{fontSize:14,fontWeight:'700',color:'#123a5e'},
  listRow:{backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:'#dceef8',paddingVertical:12,paddingHorizontal:14,marginBottom:10},
  listRowTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:4},
  pet:{fontSize:16,fontWeight:'900',color:'#123a5e',flex:1},
  status:{backgroundColor:'#e7f6f8',color:'#2c6ba3',fontWeight:'900',fontSize:11,paddingHorizontal:10,paddingVertical:5,borderRadius:999},
  cancelled:{backgroundColor:'#fde8e8',color:'#a74646'}, completed:{backgroundColor:'#e8eefc',color:'#4567a6'},
  listMeta:{fontSize:12,fontWeight:'700',color:'#5d7b91'},
  listReason:{fontSize:12,fontWeight:'600',color:'#78909b',marginTop:2},
  empty:{backgroundColor:'#fff',borderRadius:22,padding:24,alignItems:'center',borderWidth:1,borderColor:'#dceef8'},
  emptyTitle:{fontSize:17,fontWeight:'900',color:'#123a5e'}, emptyText:{marginTop:7,textAlign:'center',color:'#5d7b91'},
  pagination:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:6},
  pageButton:{minHeight:42,paddingHorizontal:16,borderRadius:14,backgroundColor:'#2c6ba3',alignItems:'center',justifyContent:'center'},
  pageButtonDisabled:{backgroundColor:'#e3edf2'},
  pageButtonText:{color:'#ffffff',fontWeight:'900',fontSize:12},
  pageButtonTextDisabled:{color:'#a9bfca'},
  pageIndicator:{color:'#5d7b91',fontWeight:'700',fontSize:12},
  modalOverlay:{flex:1,backgroundColor:'rgba(20,40,50,0.45)',justifyContent:'center',padding:20},
  modalCard:{backgroundColor:'#fff',borderRadius:22,padding:20,maxHeight:'82%'},
  modalHeaderRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
  modalTitle:{fontSize:19,fontWeight:'900',color:'#123a5e',flex:1,marginRight:10},
  modalCloseButton:{marginTop:16,minHeight:46,borderRadius:14,backgroundColor:'#2c6ba3',alignItems:'center',justifyContent:'center'},
  modalCloseText:{color:'#fff',fontWeight:'900',fontSize:13},
  infoRow:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#e6eef2'},
  infoLabel:{flex:.42,color:'#78909b',fontSize:12,fontWeight:'600'}, infoValue:{flex:.58,color:'#365f72',fontSize:12,fontWeight:'800',textAlign:'right'},
});
