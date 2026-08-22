import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';

// Medical Records no longer has its own screen -- it now lives inside the
// Animal Patient Profile's Medical History tab (same consolidation shipped
// for Pet Owner). This route stays registered only so any stale link,
// bookmark, or notification aimed at the old screen still lands somewhere
// useful instead of a dead end.
export default function VetMedRec({ navigation, route }) {
  const currentUser = getVetUser(route);
  const petId = route?.params?.selectedPetId || route?.params?.petId;

  useEffect(() => {
    if (petId) {
      navigation.replace('VetPatientProfile', { user: currentUser, petId });
    } else {
      navigation.replace('VetPatientOwners', { user: currentUser });
    }
  }, [navigation, petId, currentUser]);

  return (
    <VetShell navigation={navigation} route={route} subtitle="Animal Patients" caption="Patient Care">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <ActivityIndicator size="large" color="#447C99" />
      </View>
    </VetShell>
  );
}
