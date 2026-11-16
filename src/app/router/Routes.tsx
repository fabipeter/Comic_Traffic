import { createBrowserRouter, Navigate, RouteObject } from "react-router-dom";
import App from "../../App";
import LandingPage from "../../features/home/LandingPage";
import IndexProfilePage from "../../features/dashboard/profile/IndexProfilePage";
import NotFound from "../../features/errors/NotFound";
import LoginPage from "../../features/authentication/login/LoginPage";
import RegisterPage from "../../features/authentication/register/RegisterPage";
import RequireAuth from "./RequireAuth";

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
      { path: "not-found", element: <NotFound /> },
      { path: "*", element: <Navigate replace to="/not-found" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
