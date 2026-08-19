import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";
import useResolvedSessionUser from "../../../hooks/useResolvedSessionUser";
export default function StaffMessages(props) {
  const routeUser = props.route?.params?.user || props.route?.params || null;
  const user = useResolvedSessionUser(routeUser);
  const route = { ...props.route, params: { ...(props.route?.params || {}), user } };
  return <MobileMessagingScreen {...props} route={route} allowedRoles={["pet_owner", "veterinarian", "admin"]} title="Messages" backRoute="staff-screen" />;
}
