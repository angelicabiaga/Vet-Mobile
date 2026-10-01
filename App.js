import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { NotificationProvider, useNotificationContext } from "./src/providers/NotificationProvider";
import { getStoredSession } from "./src/api/authService";
import { getSessionUser, setSessionUser, subscribeSessionUser, withSessionUser } from "./src/session/sessionStore";

// Core Screens
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";

// Helpers
import ForgotPasswordScreen from "./src/screens/security/password/ForgotPasswordScreen";
import LoginOtpScreen from "./src/screens/security/LoginOtpScreen";
import ResetPasswordScreen from "./src/screens/security/password/ResetPasswordScreen";
import UnlockAccountScreen from "./src/screens/security/UnlockAccountScreen";

// Vet Screens
import VetAppointment from "./src/screens/dashboards/Veterinary/VetAppointment";
import VetDashboard from "./src/screens/dashboards/Veterinary/VetDashboard";
import VetMedRec from "./src/screens/dashboards/Veterinary/VetMedRec";
import VetMessages from "./src/screens/dashboards/Veterinary/VetMessages";
import VetNotif from "./src/screens/dashboards/Veterinary/VetNotif";
import VetProfile from "./src/screens/dashboards/Veterinary/VetProfile";
import VetInventory from "./src/screens/dashboards/Veterinary/VetInventory";
import VetLiveQueue from "./src/screens/dashboards/Veterinary/VetLiveQueue";
import VetPatients from "./src/screens/dashboards/Veterinary/VetPatients";
import VetPatientOwners from "./src/screens/dashboards/Veterinary/VetPatientOwners";
import VetPatientProfile from "./src/screens/dashboards/Veterinary/VetPatientProfile";
import VetPatientEdit from "./src/screens/dashboards/Veterinary/VetPatientEdit";
import VetSchedule from "./src/screens/dashboards/Veterinary/VetSchedule";

// Public Queue
import PublicQueueScreen from "./src/screens/PublicQueueScreen";

// Pet Owner Screens
import PetOwnerAppointment from "./src/screens/dashboards/PetOwner/PetOwnerAppointment";
import PetOwnerMyAppointments from "./src/screens/dashboards/PetOwner/PetOwnerMyAppointments";
import PetOwnerAppointmentSchedule from "./src/screens/dashboards/PetOwner/PetOwnerAppointmentSchedule";
import PetOwnerDashboard from "./src/screens/dashboards/PetOwner/PetOwnerDashboard";
import PetOwnerMedRec from "./src/screens/dashboards/PetOwner/PetOwnerMedRec";
import PetOwnerMessages from "./src/screens/dashboards/PetOwner/PetOwnerMessages";
import PetOwnerMyPets from "./src/screens/dashboards/PetOwner/PetOwnerMyPets";
import PetOwnerNotif from "./src/screens/dashboards/PetOwner/PetOwnerNotif";
import PetOwnerMyPetsEdit from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsEdit";
import PetOwnerMyPetsView from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsView";
import PetOwnerPayHis from "./src/screens/dashboards/PetOwner/PetOwnerPayHis";
import PetOwnerProfile from "./src/screens/dashboards/PetOwner/PetOwnerProfile";
import PetOwnerQuickAssist from "./src/screens/dashboards/PetOwner/PetOwnerQuickAssist";
import PetOwnerStaffMessages from "./src/screens/dashboards/PetOwner/PetOwnerStaffMessages";
import PetOwnerVetMessages from "./src/screens/dashboards/PetOwner/PetOwnerVetMessages";
import PetOwnerQueue from "./src/screens/dashboards/PetOwner/PetOwnerQueue";
import { PET_OWNER_TAB_ROUTES } from "./src/screens/dashboards/PetOwner/PetOwnerBottomNav";
import { VET_TAB_ROUTES } from "./src/screens/dashboards/Veterinary/VetBottomNav";

const Stack = createNativeStackNavigator();

// Bottom-bar tabs (Pet Owner and Veterinarian) crossfade instead of sliding in
// like a new page, so the bar stays put and only the content changes.
const TAB_ROUTES = [...PET_OWNER_TAB_ROUTES, ...VET_TAB_ROUTES];
const TAB_SCREEN_OPTIONS = { animation: "fade", animationDuration: 220 };

const linking = {
  prefixes: [
    "petcare://",
    "https://yourdomain.com",
  ],
  config: {
    screens: {
      unlock: "unlock-account/:token",
      PublicQueue: "queue",
    },
  },
};

function AppNavigator({ navigationRef }) {
  const { setActiveUser } = useNotificationContext();

  // Restore the logged-in account saved on this device / browser tab.
  useEffect(() => {
    getStoredSession()
      .then((session) => {
        if (!getSessionUser()) setSessionUser(session?.profile || null);
      })
      .catch(() => {});
  }, []);

  // Notifications always follow the logged-in account, never a route's params.
  useEffect(() => subscribeSessionUser((user) => setActiveUser(user)), [setActiveUser]);

  const syncActiveUser = () => {
    const route = navigationRef.current?.getCurrentRoute();
    if (route?.name === "login") {
      setActiveUser(null);
      return;
    }
    const user = getSessionUser() || route?.params?.user;
    if (user) setActiveUser(user);
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={syncActiveUser}
      onStateChange={syncActiveUser}
    >
      <Stack.Navigator
        initialRouteName="login"
        screenOptions={({ route }) => ({
          headerShown: false,
          ...(TAB_ROUTES.includes(route.name) ? TAB_SCREEN_OPTIONS : null),
        })}
      >
        {/* Authentication */}
        <Stack.Screen name="login" component={LoginScreen} />
        <Stack.Screen name="register" component={RegisterScreen} />
        <Stack.Screen name="forgot" component={ForgotPasswordScreen} />
        <Stack.Screen name="otp" component={LoginOtpScreen} />
        <Stack.Screen name="reset-password" component={ResetPasswordScreen} />
        <Stack.Screen name="unlock" component={UnlockAccountScreen} />

        {/* Public Queue */}
        <Stack.Screen
          name="PublicQueue"
          component={PublicQueueScreen}
        />

        {/* Veterinarian Flow */}
        <Stack.Screen
          name="vet-screen"
          component={withSessionUser(VetDashboard)}
        />
        <Stack.Screen
          name="VetPatientOwners"
          component={withSessionUser(VetPatientOwners)}
        />
        <Stack.Screen
          name="VetPatients"
          component={withSessionUser(VetPatients)}
        />
        <Stack.Screen
          name="VetPatientProfile"
          component={withSessionUser(VetPatientProfile)}
        />
        <Stack.Screen
          name="VetPatientEdit"
          component={withSessionUser(VetPatientEdit)}
        />
        <Stack.Screen
          name="VetSchedule"
          component={withSessionUser(VetSchedule)}
        />
        <Stack.Screen
          name="VetAppointment"
          component={withSessionUser(VetAppointment)}
        />
        <Stack.Screen
          name="VetMedRec"
          component={withSessionUser(VetMedRec)}
        />
        <Stack.Screen
          name="VetMessages"
          component={withSessionUser(VetMessages)}
        />
        <Stack.Screen
          name="VetNotif"
          component={withSessionUser(VetNotif)}
        />
        <Stack.Screen
          name="VetProfile"
          component={withSessionUser(VetProfile)}
        />
        <Stack.Screen
          name="VetInventory"
          component={withSessionUser(VetInventory)}
        />
        <Stack.Screen
          name="VetLiveQueue"
          component={withSessionUser(VetLiveQueue)}
        />

        {/* Pet Owner Flow */}
        <Stack.Screen
          name="petowner-screen"
          component={withSessionUser(PetOwnerDashboard)}
        />
        <Stack.Screen
          name="PetOwnerAppointment"
          component={withSessionUser(PetOwnerAppointment)}
        />
        <Stack.Screen
          name="PetOwnerMyAppointments"
          component={withSessionUser(PetOwnerMyAppointments)}
        />
        <Stack.Screen
          name="PetOwnerAppointmentSchedule"
          component={withSessionUser(PetOwnerAppointmentSchedule)}
        />
        <Stack.Screen
          name="PetOwnerMedRec"
          component={withSessionUser(PetOwnerMedRec)}
        />
        <Stack.Screen
          name="PetOwnerMessages"
          component={withSessionUser(PetOwnerMessages)}
        />
        <Stack.Screen
          name="PetOwnerStaffMessages"
          component={withSessionUser(PetOwnerStaffMessages)}
        />
        <Stack.Screen
          name="PetOwnerVetMessages"
          component={withSessionUser(PetOwnerVetMessages)}
        />
        <Stack.Screen
          name="PetOwnerQuickAssist"
          component={withSessionUser(PetOwnerQuickAssist)}
        />
        <Stack.Screen
          name="PetOwnerMyPets"
          component={withSessionUser(PetOwnerMyPets)}
        />
        <Stack.Screen
          name="PetOwnerMyPetsEdit"
          component={withSessionUser(PetOwnerMyPetsEdit)}
        />
        <Stack.Screen
          name="PetOwnerMyPetsView"
          component={withSessionUser(PetOwnerMyPetsView)}
        />
        <Stack.Screen
          name="PetOwnerNotif"
          component={withSessionUser(PetOwnerNotif)}
        />
        <Stack.Screen
          name="PetOwnerPayHis"
          component={withSessionUser(PetOwnerPayHis)}
        />
        <Stack.Screen
          name="PetOwnerProfile"
          component={withSessionUser(PetOwnerProfile)}
        />
        <Stack.Screen
          name="PetOwnerQueue"
          component={withSessionUser(PetOwnerQueue)}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const navigationRef = useNavigationContainerRef();
  return (
    <NotificationProvider navigationRef={navigationRef}>
      <AppNavigator navigationRef={navigationRef} />
    </NotificationProvider>
  );
}
