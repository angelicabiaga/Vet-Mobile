import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";

export default function PetOwnerMessages(props) {
  return (
    <MobileMessagingScreen
      {...props}
      allowedRoles={["staff", "veterinarian"]}
      title="Messages"
      backRoute="petowner-screen"
    />
  );
}
