import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';

// Medical Records no longer has its own screen -- it now lives inside the
// Animal Patient Profile's Medical History tab (same consolidation already
// shipped on the PawCruz web app). This route stays registered only so any
// stale link, bookmark, or notification aimed at the old screen still lands
// somewhere useful instead of a dead end.
export default function PetOwnerMedRec({ navigation, route }) {
  const user = route?.params?.user;
  const petId = route?.params?.selectedPetId || route?.params?.petId;

  useEffect(() => {
    if (petId) {
      navigation.replace('PetOwnerMyPetsView', { user, petId });
    } else {
      navigation.replace('PetOwnerMyPets', { user });
    }
  }, [navigation, petId, user]);

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#447C99" />
      </View>
    </LinearGradient>
  );
}
