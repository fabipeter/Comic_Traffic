import { createBrowserRouter, Navigate, RouteObject } from "react-router-dom";
import App from "../../App";
import LandingPage from "../../features/home/LandingPage";
// import IndexProfilePage from "../../features/dashboard/profile/IndexProfilePage";
import RequireAuth from "./RequireAuth";
import NotFound from "../../features/errors/NotFound";
import LoginPage from "../../features/authentication/login/LoginPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          // { path: "user/profile", element: <IndexProfilePage /> }
        ],
      },
      { path: "login", element: <LoginPage /> },
      //   { path: "verifyemail", element: <ConfirmEmailPage /> },
      //   { path: "register", element: <RegisterPage /> },
      //   { path: "server-error", element: <ServerError /> },
      { path: "", element: <LandingPage /> },
      { path: "not-found", element: <NotFound /> },
      { path: "*", element: <Navigate replace to="/not-found" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
