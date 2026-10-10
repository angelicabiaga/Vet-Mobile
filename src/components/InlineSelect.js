import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Compact select list (field + list that opens right under it), modelled on the
// browser <select>: a placeholder row on top, one option per row, the selected
// row highlighted, and a short scrolling list instead of a full-screen sheet.

const ROW_HEIGHT = 37;
const VISIBLE_ROWS = 8;

// error: thin red border for inline validation (the message goes below the field).
export default function InlineSelect({ options = [], value, onChange, placeholder = 'Select', disabled = false, error = false }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef(null);
  const selected = options.find((option) => option.value === value) || null;

  // Open scrolled so the selected option is in view (+1 for the placeholder row).
  const scrollToSelected = () => {
    const index = options.findIndex((option) => option.value === value);
    if (index > 2) listRef.current?.scrollTo({ y: (index - 2) * ROW_HEIGHT, animated: false });
  };

  const choose = (nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, open && styles.fieldOpen, error && styles.fieldError, disabled && styles.fieldDisabled]}
        onPress={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Text style={[styles.fieldText, !selected && styles.fieldPlaceholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.fieldIcon}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && !disabled ? (
        <View style={styles.list}>
          <ScrollView
            ref={listRef}
            style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}
            nestedScrollEnabled
            onLayout={scrollToSelected}
          >
            <TouchableOpacity style={styles.row} onPress={() => choose('')} activeOpacity={0.7}>
              <Text style={styles.rowText}>{placeholder}</Text>
            </TouchableOpacity>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <TouchableOpacity
                  key={String(option.value)}
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => choose(option.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14,
    backgroundColor: '#fbfdfe', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldOpen: { borderColor: '#2c6ba3' },
  fieldError: { borderColor: '#dc2626' },
  fieldDisabled: { opacity: 0.6 },
  fieldText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#294b5d' },
  fieldPlaceholder: { color: '#8d98a5' },
  fieldIcon: { fontSize: 10, color: '#5f7f94', marginLeft: 8 },
  list: {
    marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: '#dceef8', backgroundColor: '#ffffff', overflow: 'hidden',
    shadowColor: '#123a5e', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
  },
  row: { height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 16 },
  rowSelected: { backgroundColor: '#757575' },
  rowText: { fontSize: 15, color: '#222222' },
  rowTextSelected: { color: '#ffffff' },
});
