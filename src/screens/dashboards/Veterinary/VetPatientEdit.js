import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { loadPatientById } from './VetPatients';
import InlineSelect from '../../../components/InlineSelect';
import useScrollToError from '../../../hooks/useScrollToError';
import { PET_SEX_OPTIONS, updatePatientDetails, validatePatientDetails } from '../../../api/petService';
import { PET_SPECIES_OPTIONS } from '../PetOwner/PetOwnerMyPetsInfo';

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_OPTIONS = MONTH_LABELS.map((label, index) => ({ value: String(index + 1), label }));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 41 }, (_, index) => {
  const year = String(CURRENT_YEAR - index);
  return { value: year, label: year };
});

// Turns a pets row into form values.
function toForm(row) {
  const [year = '', month = '', day = ''] = String(row?.date_of_birth || '').split('-');
  return {
    petName: row?.pet_name || '',
    species: row?.species || '',
    breed: row?.breed || '',
    sex: row?.sex || '',
    birthYear: year,
    birthMonth: month ? String(Number(month)) : '',
    birthDay: day ? String(Number(day)) : '',
    weight: row?.weight == null ? '' : String(row.weight),
    color: row?.color || '',
    microchipNumber: row?.microchip_number || '',
    allergies: row?.allergies || '',
    existingConditions: row?.existing_conditions || '',
    notes: row?.notes || '',
  };
}

// Veterinarian → Animal Patient Profile → Edit. Updates the existing pet record
// (by its id) without changing its owner or medical history.
export default function VetPatientEdit({ navigation, route }) {
  const currentUser = getVetUser(route);
  const petId = route?.params?.petId;

  const [patient, setPatient] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(toForm(null));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const row = await loadPatientById(petId);
      if (!active) return;
      setPatient(row);
      if (row) setForm(toForm(row));
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [petId]);

  const speciesOptions = useMemo(() => {
    const list = PET_SPECIES_OPTIONS.map((species) => ({ value: species, label: species }));
    // Keep a species saved from the web that isn't in the mobile list.
    if (form.species && !PET_SPECIES_OPTIONS.includes(form.species)) list.unshift({ value: form.species, label: form.species });
    return list;
  }, [form.species]);

  // Editing a field clears its error once the value is valid again.
  const setField = useCallback((field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      setErrors((currentErrors) => {
        const errorKey = ['birthYear', 'birthMonth', 'birthDay'].includes(field) ? 'birthday' : field;
        if (!currentErrors[errorKey]) return currentErrors;
        const stillInvalid = validatePatientDetails(next)[errorKey];
        const nextErrors = { ...currentErrors };
        if (stillInvalid) nextErrors[errorKey] = stillInvalid; else delete nextErrors[errorKey];
        return nextErrors;
      });
      return next;
    });
    setFormError('');
  }, []);

  const goBackToProfile = (params = {}) =>
    navigation.navigate({ name: 'VetPatientProfile', params: { user: currentUser, petId, ...params }, merge: true });

  // A failed save scrolls back to the first field outlined in red.
  const scrollRef = useRef(null);
  const errorScroll = useScrollToError(scrollRef);
  const FIELD_ORDER = ['petName', 'species', 'breed', 'sex', 'birthday', 'weight', 'color', 'microchipNumber', 'allergies', 'existingConditions', 'notes'];

  const handleSave = async () => {
    const nextErrors = validatePatientDetails(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError('Please complete or correct the highlighted fields.');
      errorScroll.scrollToFirstError(nextErrors, FIELD_ORDER);
      return;
    }
    try {
      setSaving(true);
      setFormError('');
      await updatePatientDetails(petId, form, currentUser);
      goBackToProfile({ savedAt: Date.now() });
    } catch (error) {
      if (error.fieldErrors) {
        setErrors(error.fieldErrors);
        setFormError('Please complete or correct the highlighted fields.');
        errorScroll.scrollToFirstError(error.fieldErrors, FIELD_ORDER);
      } else {
        setFormError(error.message || 'Unable to save the animal patient details right now. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (field, label, { required = false, placeholder, keyboardType, multiline = false, maxLength } = {}) => (
    <View style={styles.field} ref={errorScroll.anchor(field)}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : <Text style={styles.optional}> (optional)</Text>}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, errors[field] && styles.inputError]}
        value={form[field]}
        onChangeText={(value) => setField(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#8d98a5"
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
      />
      {errors[field] ? <Text style={styles.errorText}>{errors[field]}</Text> : null}
    </View>
  );

  if (!loaded || !patient) {
    return (
      <VetShell navigation={navigation} route={route} subtitle="Edit Animal Patient" caption="Update patient details" showBack>
        <View style={styles.centerCard}>
          {!loaded ? <ActivityIndicator size="large" color="#2c6ba3" /> : <Text style={styles.centerText}>This animal patient could not be found.</Text>}
        </View>
      </VetShell>
    );
  }

  return (
    <VetShell navigation={navigation} route={route} subtitle="Edit Animal Patient" caption={`Editing ${patient.pet_name || 'animal patient'}`} showBack>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Animal Patient Details</Text>
          <Text style={styles.cardSubtitle}>
            Owner: {patient.owner?.full_name || patient.owner?.username || 'Not listed'} · the owner and medical history stay unchanged.
          </Text>

          {formError ? (
            <View style={styles.formErrorBox}><Text style={styles.formErrorText}>{formError}</Text></View>
          ) : null}

          {renderInput('petName', 'Pet Name', { required: true, placeholder: 'Enter pet name', maxLength: 50 })}

          <View style={styles.field} ref={errorScroll.anchor('species')}>
            <Text style={styles.label}>Species<Text style={styles.required}> *</Text></Text>
            <InlineSelect options={speciesOptions} value={form.species} placeholder="Select species" error={Boolean(errors.species)} onChange={(value) => setField('species', value)} />
            {errors.species ? <Text style={styles.errorText}>{errors.species}</Text> : null}
          </View>

          {renderInput('breed', 'Breed', { required: true, placeholder: 'Enter breed', maxLength: 60 })}

          <View style={styles.field} ref={errorScroll.anchor('sex')}>
            <Text style={styles.label}>Sex<Text style={styles.required}> *</Text></Text>
            <InlineSelect options={PET_SEX_OPTIONS.map((sex) => ({ value: sex, label: sex }))} value={form.sex} placeholder="Select sex" error={Boolean(errors.sex)} onChange={(value) => setField('sex', value)} />
            {errors.sex ? <Text style={styles.errorText}>{errors.sex}</Text> : null}
          </View>

          <View style={styles.field} ref={errorScroll.anchor('birthday')}>
            <Text style={styles.label}>Birthday<Text style={styles.required}> *</Text></Text>
            <View style={styles.birthdayRow}>
              <View style={styles.birthdayMonth}>
                <InlineSelect options={MONTH_OPTIONS} value={form.birthMonth} placeholder="Month" error={Boolean(errors.birthday)} onChange={(value) => setField('birthMonth', value)} />
              </View>
              <View style={styles.birthdayDay}>
                <InlineSelect options={DAY_OPTIONS} value={form.birthDay} placeholder="Day" error={Boolean(errors.birthday)} onChange={(value) => setField('birthDay', value)} />
              </View>
              <View style={styles.birthdayYear}>
                <InlineSelect options={YEAR_OPTIONS} value={form.birthYear} placeholder="Year" error={Boolean(errors.birthday)} onChange={(value) => setField('birthYear', value)} />
              </View>
            </View>
            {errors.birthday ? <Text style={styles.errorText}>{errors.birthday}</Text> : null}
          </View>

          {renderInput('weight', 'Weight (kg)', { placeholder: 'e.g. 4.5', keyboardType: 'decimal-pad', maxLength: 6 })}
          {renderInput('color', 'Color', { placeholder: 'e.g. Brown', maxLength: 40 })}
          {renderInput('microchipNumber', 'Microchip Number', { placeholder: '9 to 15 digits', keyboardType: 'number-pad', maxLength: 15 })}
          {renderInput('allergies', 'Allergies', { placeholder: 'Known allergies', multiline: true, maxLength: 500 })}
          {renderInput('existingConditions', 'Existing Conditions', { placeholder: 'Known conditions', multiline: true, maxLength: 500 })}
          {renderInput('notes', 'Notes', { placeholder: 'Special markings or other notes', multiline: true, maxLength: 500 })}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => goBackToProfile()} disabled={saving} activeOpacity={0.9}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonBusy]} onPress={handleSave} disabled={saving} activeOpacity={0.9}>
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  card: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: '#123a5e' },
  cardSubtitle: { marginTop: 4, marginBottom: 6, fontSize: 12.5, fontWeight: '600', color: '#5f7f94', lineHeight: 18 },
  formErrorBox: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F5B5B5', backgroundColor: '#FDECEC' },
  formErrorText: { color: '#D32F2F', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  field: { marginTop: 14 },
  label: { color: '#123a5e', fontSize: 14, fontWeight: '800', marginBottom: 7 },
  required: { color: '#D32F2F' },
  optional: { color: '#78909b', fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, color: '#294b5d', backgroundColor: '#fbfdfe', fontWeight: '600', fontSize: 14 },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  inputError: { borderColor: '#EF4444', borderWidth: 1.5 },
  errorText: { color: '#D32F2F', fontSize: 12, fontWeight: '700', marginTop: 6, marginLeft: 4 },
  birthdayRow: { flexDirection: 'row', gap: 8 },
  birthdayMonth: { flex: 1.5 },
  birthdayDay: { flex: 1 },
  birthdayYear: { flex: 1.2 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancelButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf6f8', borderWidth: 1, borderColor: '#c6e5ed' },
  cancelText: { color: '#2c6ba3', fontSize: 15, fontWeight: '900' },
  saveButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2c6ba3' },
  saveButtonBusy: { opacity: 0.7 },
  saveText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  centerCard: { margin: 18, padding: 24, borderRadius: 22, backgroundColor: '#fcfeff', borderWidth: 1, borderColor: '#dceef8', alignItems: 'center' },
  centerText: { fontSize: 15, fontWeight: '800', color: '#123a5e' },
});
