import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { generatePredictiveHealthAnalysisForPet } from '../../../api/aiService';
import {
  computeRiskLevel,
  daysUntil,
  formatConsultationDate,
  keywordSet,
  parseAiReport,
  sharesKeyword,
  splitRiskName,
  toListItems,
  toSentences,
} from '../../../utils/predictiveHealthParsing';

const RING_SIZE = 132;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LEVEL_COLOR = { Low: '#2f8f5b', Moderate: '#d99a1f', High: '#c0392b' };
const LEVEL_BADGE = { Low: 'statusBadgeGood', Moderate: 'statusBadgeWarn', High: 'statusBadgeRisk' };
const LEVEL_BADGE_TEXT = { Low: 'statusBadgeGoodText', Moderate: 'statusBadgeWarnText', High: 'statusBadgeRiskText' };

function HealthScoreRing({ score, level }) {
  const color = LEVEL_COLOR[level] || '#447C99';
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={[styles.ringWrap, { width: RING_SIZE, height: RING_SIZE }]}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke="#eef3f5" strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE}, ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={styles.ringScoreValue}>{score}</Text>
        <Text style={styles.ringScoreMax}>/100</Text>
      </View>
    </View>
  );
}

export default function PetOwnerMyPetsAIHealth({ pet, records = [], recordsLoading, active }) {
  const [state, setState] = useState({ loading: false, error: '', text: '', loaded: false });

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      // Prefer the raw Supabase pet row already joined onto each record
      // (has a real date_of_birth) over the UI-shaped `pet` prop, which
      // only carries birthMonth/birthDay/birthYear.
      const aiPet = records[0]?.pet || pet;
      const text = await generatePredictiveHealthAnalysisForPet(aiPet, records);
      setState({ loading: false, error: '', text, loaded: true });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Unable to generate the AI predictive health analysis.' }));
    }
  };

  useEffect(() => {
    if (active && !recordsLoading && records.length && !state.loaded && !state.loading && !state.error) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, recordsLoading, records.length]);

  const { sections, disclaimer } = useMemo(() => parseAiReport(state.text), [state.text]);

  const timeline = useMemo(() => {
    if (!records.length) return [];
    const chronological = [...records].sort(
      (a, b) => new Date(a.consultation_date || 0) - new Date(b.consultation_date || 0)
    );
    return chronological
      .map((entry, index) => {
        const priorEntries = chronological.slice(0, index);
        const ownKeywords = keywordSet(`${entry.symptoms || ''} ${entry.diagnosis || ''}`);
        const recurring = priorEntries.some((prior) =>
          sharesKeyword(ownKeywords, keywordSet(`${prior.symptoms || ''} ${prior.diagnosis || ''}`))
        );
        return { ...entry, patternBadge: !ownKeywords.size ? null : recurring ? 'Recurring' : 'New' };
      })
      .reverse();
  }, [records]);

  const upcomingActions = useMemo(() => {
    return records
      .filter((entry) => entry.follow_up_date)
      .map((entry) => ({ date: entry.follow_up_date, label: entry.treatment_plan || entry.diagnosis || 'Follow-up visit' }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
  }, [records]);

  const latest = records[0] || null;

  const preventiveCare = useMemo(() => {
    const hasRecentVaccination = records.some((r) => {
      if (!r.vaccination) return false;
      if (!r.consultation_date) return true;
      const days = Math.round(
        (Date.now() - new Date(`${String(r.consultation_date).slice(0, 10)}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24)
      );
      return days <= 365;
    });
    const followUpDays = latest?.follow_up_date ? daysUntil(latest.follow_up_date) : null;
    const overdue = followUpDays !== null && followUpDays < 0;
    return { onTrack: hasRecentVaccination && !overdue, hasRecentVaccination, overdue };
  }, [records, latest]);

  const riskSentences = toListItems(sections['POTENTIAL HEALTH RISKS TO MONITOR'] || [], 6);
  const patternLines = toSentences((sections['OBSERVED HEALTH PATTERNS'] || []).join(' '));
  const followUpLines = toSentences((sections['FOLLOW-UP CONSIDERATIONS'] || []).join(' '));
  const actionItems = toListItems(sections['SUGGESTED CLINICAL ACTIONS'] || [], 5);
  const recommendedActions = [...followUpLines, ...actionItems];
  const overviewLines = toSentences((sections['CLINICAL RECORD SUMMARY'] || []).join(' ')).slice(0, 2);

  const riskLevelInfo = useMemo(() => {
    const recurringCount = timeline.filter((entry) => entry.patternBadge === 'Recurring').length;
    const followUpDays = latest?.follow_up_date ? daysUntil(latest.follow_up_date) : null;
    return computeRiskLevel({
      riskCount: riskSentences.length,
      recurringCount,
      followUpSoon: followUpDays !== null && followUpDays >= 0 && followUpDays <= 14,
      followUpOverdue: followUpDays !== null && followUpDays < 0,
    });
  }, [timeline, riskSentences.length, latest]);

  if (recordsLoading) {
    return (
      <View style={styles.aiEmptyCard}>
        <ActivityIndicator color="#4da8da" />
        <Text style={styles.aiEmptyText}>Loading consultation history...</Text>
      </View>
    );
  }

  if (!records.length) {
    return (
      <View style={styles.aiEmptyCard}>
        <Text style={styles.aiEmptyText}>
          AI Predictive Health will be available once this pet has at least one finalized consultation.
        </Text>
      </View>
    );
  }

  if (!state.loaded && !state.error) {
    return (
      <View style={styles.aiEmptyCard}>
        <ActivityIndicator color="#4da8da" />
        <Text style={styles.aiEmptyText}>Analyzing this pet's complete consultation history...</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.aiEmptyCard}>
        <Text style={styles.aiEmptyText}>{state.error}</Text>
        <TouchableOpacity style={[styles.primaryActionButton, { marginTop: 14 }]} onPress={load} activeOpacity={0.9}>
          <Text style={styles.primaryActionText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badgeKey = LEVEL_BADGE[riskLevelInfo.level];
  const badgeTextKey = LEVEL_BADGE_TEXT[riskLevelInfo.level];

  return (
    <View>
      <View style={styles.ringCard}>
        <HealthScoreRing score={riskLevelInfo.score} level={riskLevelInfo.level} />
        <View style={[styles.statusBadge, styles[badgeKey], { marginTop: 12 }]}>
          <Text style={[styles.statusBadgeText, styles[badgeTextKey]]}>{riskLevelInfo.level} Risk</Text>
        </View>
        <Text style={styles.ringCaption}>
          Based on {records.length} consultation{records.length === 1 ? '' : 's'} · Last visit{' '}
          {formatConsultationDate(latest?.consultation_date)}
        </Text>
      </View>

      <View style={styles.aiHealthSummaryRow}>
        <View style={styles.aiSummaryCard}>
          <View style={styles.aiSummaryCardInner}>
            <Text style={styles.aiSummaryLabel}>Consultations Analyzed</Text>
            <Text style={styles.aiSummaryValue}>{records.length}</Text>
            <Text style={styles.aiSummaryCaption}>Finalized visits on record</Text>
          </View>
        </View>
        <View style={styles.aiSummaryCard}>
          <View style={styles.aiSummaryCardInner}>
            <Text style={styles.aiSummaryLabel}>Last Consultation</Text>
            <Text style={[styles.aiSummaryValue, { fontSize: 15 }]}>{formatConsultationDate(latest?.consultation_date)}</Text>
            <Text style={styles.aiSummaryCaption}>{latest?.diagnosis || latest?.chief_complaint || 'No diagnosis recorded'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.preventiveRow}>
        <View>
          <Text style={styles.preventiveLabel}>Preventive Care</Text>
          <Text style={styles.preventiveSub}>
            {preventiveCare.overdue
              ? 'A follow-up visit is overdue.'
              : preventiveCare.hasRecentVaccination
              ? 'Vaccination on record within the last year.'
              : 'No recent vaccination on record.'}
          </Text>
        </View>
        <View style={[styles.statusBadge, preventiveCare.onTrack ? styles.statusBadgeGood : styles.statusBadgeWarn]}>
          <Text style={[styles.statusBadgeText, preventiveCare.onTrack ? styles.statusBadgeGoodText : styles.statusBadgeWarnText]}>
            {preventiveCare.onTrack ? 'On Track' : 'Needs Attention'}
          </Text>
        </View>
      </View>

      {overviewLines.length ? (
        <View style={styles.aiCard}>
          <Text style={styles.aiCardTitle}>AI Health Summary</Text>
          <Text style={styles.aiBulletText}>{overviewLines.join(' ')}</Text>
        </View>
      ) : null}

      <View style={styles.aiCard}>
        <Text style={styles.aiCardTitle}>Observed Health Patterns</Text>
        <Text style={styles.aiCardSubtitle}>AI-identified trends across this pet's consultation history</Text>

        {timeline.map((entry) => {
          const badgeStyle = entry.patternBadge === 'Recurring' ? 'statusBadgeWarn' : 'statusBadgeNeutral';
          const badgeTextStyle = entry.patternBadge === 'Recurring' ? 'statusBadgeWarnText' : 'statusBadgeNeutralText';
          const symptomChips = entry.symptoms
            ? String(entry.symptoms).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
            : [];

          return (
            <View key={entry.id} style={styles.patternRow}>
              <View style={styles.patternDateRow}>
                <Text style={styles.patternDateText}>{formatConsultationDate(entry.consultation_date)}</Text>
                {entry.patternBadge ? (
                  <View style={[styles.patternBadgeMini, styles[badgeStyle]]}>
                    <Text style={[styles.patternBadgeMiniText, styles[badgeTextStyle]]}>{entry.patternBadge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.patternBody}>{entry.diagnosis || entry.chief_complaint || 'No diagnosis recorded'}</Text>
              {symptomChips.length ? (
                <View style={styles.chipRow}>
                  {symptomChips.map((chip, index) => (
                    <View key={index} style={styles.chip}>
                      <Text style={styles.chipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {patternLines.length ? (
          <View style={{ marginTop: 10 }}>
            {patternLines.map((line, index) => (
              <View key={index} style={styles.aiBulletRow}>
                <View style={styles.aiBulletDot} />
                <Text style={styles.aiBulletText}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiCardTitle}>Potential Health Risks to Monitor</Text>
        {riskSentences.length ? (
          riskSentences.map((sentence, index) => {
            const { name, detail } = splitRiskName(sentence);
            return (
              <View key={index} style={styles.aiRiskRow}>
                <Text style={styles.aiRiskName}>
                  {index + 1}. {name}
                </Text>
                {detail ? <Text style={styles.aiRiskDetail}>{detail}</Text> : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.aiMutedText}>No specific risks were flagged from the available records.</Text>
        )}
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiCardTitle}>Recommended Actions</Text>
        {recommendedActions.length ? (
          recommendedActions.slice(0, 6).map((item, index) => (
            <View key={index} style={styles.aiCheckRow}>
              <View style={styles.aiCheckMark}>
                <Text style={styles.aiCheckMarkText}>{'✓'}</Text>
              </View>
              <Text style={styles.aiBulletText}>{item}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.aiMutedText}>No recommended actions were returned.</Text>
        )}
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiCardTitle}>Upcoming Follow-ups</Text>
        {upcomingActions.length ? (
          upcomingActions.map((action, index) => (
            <View key={index} style={styles.upcomingRow}>
              <View style={styles.upcomingDot} />
              <Text style={styles.upcomingText}>
                {action.label} — {formatConsultationDate(action.date)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.aiMutedText}>No upcoming follow-ups, vaccinations, or checkups on record.</Text>
        )}
      </View>

      <View style={styles.aiDisclaimer}>
        <Text style={styles.aiDisclaimerText}>
          {disclaimer ||
            "AI predictive health analysis is based only on available PawCruz medical records and is intended to support, not replace, the veterinarian's diagnosis, treatment decisions, or clinical judgment."}
        </Text>
      </View>
    </View>
  );
}
