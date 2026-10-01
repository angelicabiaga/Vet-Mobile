import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Month calendar date picker (field + inline calendar), modelled on the browser
// date picker: month title, up/down month arrows, Su–Sa grid with adjacent-month
// days greyed out, and Clear / Today links. Dates outside [minDate, maxDate] are
// disabled. Values are 'YYYY-MM-DD' strings.

const WEEK_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (value) => String(value).padStart(2, '0');
const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromKey = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

function buildMonthGrid(month) {
  const first = monthStart(month);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export default function CalendarDatePicker({ value, onChange, minDate, maxDate, placeholder = 'Select date' }) {
  const todayKey = toKey(new Date());
  const selected = fromKey(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selected || fromKey(minDate) || new Date()));

  useEffect(() => {
    if (selected) setVisibleMonth(monthStart(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const isAllowed = (key) => (!minDate || key >= minDate) && (!maxDate || key <= maxDate);

  const minMonth = minDate ? monthStart(fromKey(minDate)) : null;
  const maxMonth = maxDate ? monthStart(fromKey(maxDate)) : null;
  const canGoPrev = !minMonth || visibleMonth > minMonth;
  const canGoNext = !maxMonth || visibleMonth < maxMonth;
  const shiftMonth = (step) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));

  const pick = (key) => {
    onChange?.(key);
    setOpen(false);
  };

  const fieldLabel = selected
    ? selected.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;
  const monthTitle = visibleMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <View>
      <TouchableOpacity style={[styles.field, open && styles.fieldOpen]} onPress={() => setOpen((current) => !current)} activeOpacity={0.85}>
        <Text style={[styles.fieldText, !selected && styles.fieldPlaceholder]}>{fieldLabel}</Text>
        <Text style={styles.fieldIcon}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open ? (
        <View style={styles.calendar}>
          <View style={styles.headerRow}>
            <Text style={styles.monthTitle}>{monthTitle} ▾</Text>
            <View style={styles.arrows}>
              <TouchableOpacity onPress={() => canGoPrev && shiftMonth(-1)} disabled={!canGoPrev} style={styles.arrowButton} accessibilityLabel="Previous month">
                <Text style={[styles.arrowText, !canGoPrev && styles.arrowDisabled]}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => canGoNext && shiftMonth(1)} disabled={!canGoNext} style={styles.arrowButton} accessibilityLabel="Next month">
                <Text style={[styles.arrowText, !canGoNext && styles.arrowDisabled]}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEK_LABELS.map((label) => <Text key={label} style={styles.weekLabel}>{label}</Text>)}
          </View>

          <View style={styles.grid}>
            {days.map((date) => {
              const key = toKey(date);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const allowed = isAllowed(key);
              const isSelected = key === value;
              const isToday = key === todayKey;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.cell}
                  onPress={() => allowed && pick(key)}
                  disabled={!allowed}
                  activeOpacity={0.7}
                  accessibilityLabel={date.toDateString()}
                >
                  <View style={[styles.dayBox, isToday && !isSelected && styles.dayToday, isSelected && styles.daySelected]}>
                    <Text
                      style={[
                        styles.dayText,
                        !inMonth && styles.dayOutside,
                        !allowed && styles.dayDisabled,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity onPress={() => { onChange?.(''); setOpen(false); }}>
              <Text style={styles.footerLink}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => (isAllowed(todayKey) ? pick(todayKey) : setVisibleMonth(monthStart(new Date())))}>
              <Text style={styles.footerLink}>Today</Text>
            </TouchableOpacity>
          </View>
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
  fieldText: { fontSize: 14, fontWeight: '600', color: '#294b5d' },
  fieldPlaceholder: { color: '#8d98a5' },
  fieldIcon: { fontSize: 10, color: '#5f7f94' },
  calendar: {
    marginTop: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#dceef8', backgroundColor: '#ffffff',
    shadowColor: '#123a5e', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  monthTitle: { fontSize: 15, fontWeight: '800', color: '#123a5e' },
  arrows: { flexDirection: 'row' },
  arrowButton: { paddingHorizontal: 10, paddingVertical: 4 },
  arrowText: { fontSize: 20, color: '#123a5e' },
  arrowDisabled: { color: '#c3d1da' },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekLabel: { width: '14.28%', textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#294b5d' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  dayBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1, borderColor: '#2c6ba3' },
  daySelected: { backgroundColor: '#2c6ba3' },
  dayText: { fontSize: 14, fontWeight: '600', color: '#123a5e' },
  dayOutside: { color: '#9aaab5' },
  dayDisabled: { color: '#cdd6dc' },
  dayTextSelected: { color: '#ffffff', fontWeight: '800' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 6 },
  footerLink: { fontSize: 14, fontWeight: '700', color: '#2c6ba3' },
});
