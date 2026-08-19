import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { NotificationProvider, useNotificationContext } from "./src/providers/NotificationProvider";

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
import VetMedRecDetail from "./src/screens/dashboards/Veterinary/VetMedRecDetail";
import VetMessages from "./src/screens/dashboards/Veterinary/VetMessages";
import VetNotif from "./src/screens/dashboards/Veterinary/VetNotif";
import VetProfile from "./src/screens/dashboards/Veterinary/VetProfile";
import VetInventory from "./src/screens/dashboards/Veterinary/VetInventory";
import VetLiveQueue from "./src/screens/dashboards/Veterinary/VetLiveQueue";
import VetPatients from "./src/screens/dashboards/Veterinary/VetPatients";

// Public Queue
import PublicQueueScreen from "./src/screens/PublicQueueScreen";

// Admin Screens
import AdminCreateAccount from "./src/screens/dashboards/Admin/AdminCreateAccount";
import AdminDashboard from "./src/screens/dashboards/Admin/AdminDashboard";
import AdminMessages from "./src/screens/dashboards/Admin/AdminMessages";
import AdminNotif from "./src/screens/dashboards/Admin/AdminNotif";
import AdminProfile from "./src/screens/dashboards/Admin/AdminProfile";
import AdminUserManagement from "./src/screens/dashboards/Admin/AdminUserManagement";
import AdminVetVerification from "./src/screens/dashboards/Admin/AdminVetVerification";

// Staff Screens
import StaffDashboard from "./src/screens/dashboards/Staff/StaffDashboard";
import StaffAppointment from "./src/screens/dashboards/Staff/StaffAppointment";
import StaffAppointmentList from "./src/screens/dashboards/Staff/StaffAppointmentList";
import StaffAppointmentDatabase from "./src/screens/dashboards/Staff/StaffAppointmentDatabase";
import StaffMessages from "./src/screens/dashboards/Staff/StaffMessages";
import StaffNotif from "./src/screens/dashboards/Staff/StaffNotif";
import StaffProfile from "./src/screens/dashboards/Staff/StaffProfile";
import StaffInventory from "./src/screens/dashboards/Staff/StaffInventory";
import StaffUserManagement from "./src/screens/dashboards/Staff/StaffUserManagement";
import StaffCreateAccount from "./src/screens/dashboards/Staff/StaffCreateAccount";
import StaffManageAccount from "./src/screens/dashboards/Staff/StaffManageAccount";
import StaffPayHis from "./src/screens/dashboards/Staff/StaffPayHis";
import StaffActivityLogs from "./src/screens/dashboards/Staff/StaffActivityLogs";
import StaffLogs from "./src/screens/dashboards/Staff/StaffLogs";
import StaffMyPets from "./src/screens/dashboards/Staff/StaffMyPets";
import StaffPetsProfile from "./src/screens/dashboards/Staff/StaffPetsProfile";
import StaffPetsProfileEdit from "./src/screens/dashboards/Staff/StaffPetsProfileEdit";

// Pet Owner Screens
import PetOwnerAppointment from "./src/screens/dashboards/PetOwner/PetOwnerAppointment";
import PetOwnerAppointmentSchedule from "./src/screens/dashboards/PetOwner/PetOwnerAppointmentSchedule";
import PetOwnerDashboard from "./src/screens/dashboards/PetOwner/PetOwnerDashboard";
import PetOwnerMedRec from "./src/screens/dashboards/PetOwner/PetOwnerMedRec";
import PetOwnerMessages from "./src/screens/dashboards/PetOwner/PetOwnerMessages";
import PetOwnerMyPets from "./src/screens/dashboards/PetOwner/PetOwnerMyPets";
import PetOwnerNotif from "./src/screens/dashboards/PetOwner/PetOwnerNotif";
import PetOwnerMyPetsEdit from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsEdit";
import PetOwnerMyPetsView from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsView";
import PetOwnerProfile from "./src/screens/dashboards/PetOwner/PetOwnerProfile";
import PetOwnerQuickAssist from "./src/screens/dashboards/PetOwner/PetOwnerQuickAssist";
import PetOwnerStaffMessages from "./src/screens/dashboards/PetOwner/PetOwnerStaffMessages";
import PetOwnerVetMessages from "./src/screens/dashboards/PetOwner/PetOwnerVetMessages";
import PetOwnerQueue from "./src/screens/dashboards/PetOwner/PetOwnerQueue";

const Stack = createNativeStackNavigator();

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

  const syncActiveUser = () => {
    const user = navigationRef.current?.getCurrentRoute()?.params?.user;
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
        screenOptions={{ headerShown: false }}
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

        {/* Admin Flow */}
        <Stack.Screen
          name="admin-screen"
          component={AdminDashboard}
        />
        <Stack.Screen
          name="AdminUserManagement"
          component={AdminUserManagement}
        />
        <Stack.Screen
          name="AdminVetVerification"
          component={AdminVetVerification}
        />
        <Stack.Screen
          name="AdminCreateAccount"
          component={AdminCreateAccount}
        />
        <Stack.Screen
          name="AdminMessages"
          component={AdminMessages}
        />
        <Stack.Screen
          name="AdminNotif"
          component={AdminNotif}
        />
        <Stack.Screen
          name="AdminProfile"
          component={AdminProfile}
        />

        {/* Staff Flow */}
        <Stack.Screen name="staff-screen" component={StaffDashboard} />
        <Stack.Screen name="StaffAppointment" component={StaffAppointment} />
        <Stack.Screen name="StaffAppointmentList" component={StaffAppointmentList} />
        <Stack.Screen name="StaffAppointmentDatabase" component={StaffAppointmentDatabase} />
        <Stack.Screen name="StaffMessages" component={StaffMessages} />
        <Stack.Screen name="StaffNotif" component={StaffNotif} />
        <Stack.Screen name="StaffProfile" component={StaffProfile} />
        <Stack.Screen name="StaffInventory" component={StaffInventory} />
        <Stack.Screen name="StaffUserManagement" component={StaffUserManagement} />
        <Stack.Screen name="StaffCreateAccount" component={StaffCreateAccount} />
        <Stack.Screen name="StaffManageAccount" component={StaffManageAccount} />
        <Stack.Screen name="StaffPayHis" component={StaffPayHis} />
        <Stack.Screen name="StaffActivityLogs" component={StaffActivityLogs} />
        <Stack.Screen name="StaffLogs" component={StaffLogs} />
        <Stack.Screen name="StaffMyPets" component={StaffMyPets} />
        <Stack.Screen name="StaffPetsProfile" component={StaffPetsProfile} />
        <Stack.Screen name="StaffPetsProfileEdit" component={StaffPetsProfileEdit} />

        {/* Veterinarian Flow */}
        <Stack.Screen
          name="vet-screen"
          component={VetDashboard}
        />
        <Stack.Screen
          name="VetPatients"
          component={VetPatients}
        />
        <Stack.Screen
          name="VetAppointment"
          component={VetAppointment}
        />
        <Stack.Screen
          name="VetMedRec"
          component={VetMedRec}
        />
        <Stack.Screen
          name="VetMedRecDetail"
          component={VetMedRecDetail}
        />
        <Stack.Screen
          name="VetMessages"
          component={VetMessages}
        />
        <Stack.Screen
          name="VetNotif"
          component={VetNotif}
        />
        <Stack.Screen
          name="VetProfile"
          component={VetProfile}
        />
        <Stack.Screen
          name="VetInventory"
          component={VetInventory}
        />
        <Stack.Screen
          name="VetLiveQueue"
          component={VetLiveQueue}
        />

        {/* Pet Owner Flow */}
        <Stack.Screen
          name="petowner-screen"
          component={PetOwnerDashboard}
        />
        <Stack.Screen
          name="PetOwnerAppointment"
          component={PetOwnerAppointment}
        />
        <Stack.Screen
          name="PetOwnerAppointmentSchedule"
          component={PetOwnerAppointmentSchedule}
        />
        <Stack.Screen
          name="PetOwnerMedRec"
          component={PetOwnerMedRec}
        />
        <Stack.Screen
          name="PetOwnerMessages"
          component={PetOwnerMessages}
        />
        <Stack.Screen
          name="PetOwnerStaffMessages"
          component={PetOwnerStaffMessages}
        />
        <Stack.Screen
          name="PetOwnerVetMessages"
          component={PetOwnerVetMessages}
        />
        <Stack.Screen
          name="PetOwnerQuickAssist"
          component={PetOwnerQuickAssist}
        />
        <Stack.Screen
          name="PetOwnerMyPets"
          component={PetOwnerMyPets}
        />
        <Stack.Screen
          name="PetOwnerMyPetsEdit"
          component={PetOwnerMyPetsEdit}
        />
        <Stack.Screen
          name="PetOwnerMyPetsView"
          component={PetOwnerMyPetsView}
        />
        <Stack.Screen
          name="PetOwnerNotif"
          component={PetOwnerNotif}
        />
        <Stack.Screen
          name="PetOwnerProfile"
          component={PetOwnerProfile}
        />
        <Stack.Screen
          name="PetOwnerQueue"
          component={PetOwnerQueue}
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
