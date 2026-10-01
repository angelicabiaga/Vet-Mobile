import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";
import useResolvedSessionUser from "../../../hooks/useResolvedSessionUser";
export default function VetMessages(props) {
  const routeUser = props.route?.params?.user || null;
  const user = useResolvedSessionUser(routeUser);
  const route = { ...props.route, params: { ...(props.route?.params || {}), user } };
  // Veterinarians can message pet owners and the clinic team (Staff and Admin).
  return <MobileMessagingScreen {...props} route={route} allowedRoles={["pet_owner", "staff", "admin", "administrator"]} title="Messages" backRoute="vet-screen" />;
}
