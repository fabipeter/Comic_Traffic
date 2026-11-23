import { createBrowserRouter, Navigate, RouteObject } from "react-router-dom";
import App from "../../App";
import LandingPage from "../../features/home/LandingPage";
import IndexProfilePage from "../../features/dashboard/profile/IndexProfilePage";
import NotFound from "../../features/errors/NotFound";
import LoginPage from "../../features/authentication/login/LoginPage";
import RegisterPage from "../../features/authentication/register/RegisterPage";
import ForgotPasswordPage from "../../features/authentication/forgot-password/ForgotPasswordPage";
import {
  PrivacyPolicyPage,
  TermsOfServicePage,
  AttributionsDmcaPage,
} from "../../features/legal/LegalPages";
import RequireAuth from "./RequireAuth";
import { setAppNavigator } from "./navigation";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { path: "", element: <LandingPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "dashboard", element: <IndexProfilePage /> },
          { path: "user/profile", element: <IndexProfilePage /> },
        ],
      },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ForgotPasswordPage /> },
      { path: "privacy", element: <PrivacyPolicyPage /> },
      { path: "terms", element: <TermsOfServicePage /> },
      { path: "legal/attributions", element: <AttributionsDmcaPage /> },
      { path: "attributions", element: <AttributionsDmcaPage /> },
      { path: "dmca", element: <AttributionsDmcaPage /> },
      { path: "not-found", element: <NotFound /> },
      { path: "*", element: <Navigate replace to="/not-found" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
setAppNavigator((to) => {
  router.navigate(to);
});
