import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../app/stores/store";
import Nav from "../../home/Nav";

const LoginPage = () => {
  const navigate = useNavigate();
  const { userStore } = useStore();
  const [email, setEmail] = useState("demo@comictraffic.io");
  const [password, setPassword] = useState("ComicTraffic123!");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      await userStore.loginWithComicTraffic({ email, password });
    } catch (err: any) {
      setErrorMessage(err?.message || "Unable to sign in. Please check credentials.");
    }
  };

  const handleQuickDemo = async () => {
    setErrorMessage("");
    await userStore.loginAsDemoUser();
  };

  return (
    <div className="ct-auth-page">
      <Nav />
      <div className="ct-auth-card-wrapper">
        <div className="ct-auth-card">
          <div className="ct-auth-badge">
            ⚡ Comic Traffic Member Access
          </div>
          <h2>Sign In to Comic Traffic</h2>
          <p className="ct-auth-subtitle">
            Access your cumulative rating dashboard, comic reading list, and custom API source weights.
          </p>

          {errorMessage && (
            <div className="ct-auth-error" role="alert">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="ct-auth-form">
            <div className="ct-form-field">
              <label htmlFor="ct-login-email">Email or Username</label>
              <input
                id="ct-login-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo@comictraffic.io"
                required
              />
            </div>

            <div className="ct-form-field">
              <label htmlFor="ct-login-password">Password</label>
              <input
                id="ct-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="ct-primary-cta-btn ct-full-btn"
              disabled={userStore.loginStatus === "loading"}
            >
              {userStore.loginStatus === "loading"
                ? "Signing In..."
                : "Sign In"}
            </button>
          </form>

          <div className="ct-auth-divider">
            <span>or instant analyst access</span>
          </div>

          <button
            type="button"
            className="ct-secondary-cta-btn ct-full-btn"
            onClick={handleQuickDemo}
          >
            ⚡ One-Click Demo Login (Alex Mercer / ComicWarden)
          </button>

          <p className="ct-auth-footer-text">
            New to ComicTraffic?{" "}
            <button
              type="button"
              className="ct-inline-link-btn"
              onClick={() => navigate("/register")}
            >
              Create an Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default observer(LoginPage);
