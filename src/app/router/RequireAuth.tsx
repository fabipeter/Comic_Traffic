import { Navigate, Outlet, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store";

function RequireAuth() {
  const { userStore, commonStore } = useStore();
  const location = useLocation();

  if (!userStore.isLoggedIn && !commonStore.isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export default observer(RequireAuth);
