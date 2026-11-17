import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../app/stores/store";
import Nav from "../../home/Nav";

const AVAILABLE_GENRE_OPTIONS = [
  "Superhero",
  "Graphic Novel",
  "Sci-Fi",
  "Noir",
  "Animation",
  "Fantasy",
  "Horror",
  "Indie Comic",
];

const RegisterPage = () => {
  const navigate = useNavigate();
  const { userStore } = useStore();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([
    "Superhero",
    "Graphic Novel",
    "Sci-Fi",
  ]);
  const [errorMessage, setErrorMessage] = useState("");

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const trimmedEmail = email.trim();
    const atIdx = trimmedEmail.indexOf("@");
    const dotIdx = atIdx > 0 ? trimmedEmail.indexOf(".", atIdx + 1) : -1;
    if (
      !trimmedEmail ||
      trimmedEmail.includes(" ") ||
      atIdx <= 0 ||
      dotIdx <= atIdx + 1 ||
      dotIdx >= trimmedEmail.length - 1
    ) {
      setErrorMessage("Please enter a valid email address (required for account recovery).");
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    try {
      await userStore.registerWithComicTraffic({
        username: username.trim(),
        email: trimmedEmail,
        password,
        displayName: (displayName || username).trim(),
        favoriteGenres: selectedGenres,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || "Registration failed.");
    }
  };

  return (
    <div className="ct-auth-page">
      <Nav />
      <div className="ct-auth-card-wrapper">
        <div className="ct-auth-card">
          <div className="ct-auth-badge">
            ⚡ Join the Comic Traffic Community
          </div>
          <h2>Create Your Comic Traffic Account</h2>
          <p className="ct-auth-subtitle">
            Build custom comic & movie lists, contribute to cumulative scores, and personalize rating API weights.
          </p>

          {errorMessage && (
            <div className="ct-auth-error" role="alert">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="ct-auth-form">
            <div className="ct-form-field">
              <label htmlFor="ct-reg-username">Username</label>
              <input
                id="ct-reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. nightwing_reader"
                required
              />
            </div>

            <div className="ct-form-field">
              <label htmlFor="ct-reg-display">Display Name</label>
              <input
                id="ct-reg-display"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Dick Grayson"
                required
              />
            </div>

            <div className="ct-form-field">
              <label htmlFor="ct-reg-email">Email Address *</label>
              <input
                id="ct-reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reader@comictraffic.io"
                autoComplete="email"
                required
              />
            </div>

            <div className="ct-form-field">
              <label htmlFor="ct-reg-password">Password *</label>
              <input
                id="ct-reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="ct-form-field">
              <label>Favorite Genres</label>
              <div className="ct-genre-picker">
                {AVAILABLE_GENRE_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`ct-genre-pick-btn ${
                      selectedGenres.includes(g) ? "selected" : ""
                    }`}
                    onClick={() => toggleGenre(g)}
                  >
                    {selectedGenres.includes(g) ? "✓ " : "+ "}
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="ct-primary-cta-btn ct-full-btn"
              disabled={userStore.loginStatus === "loading"}
            >
              {userStore.loginStatus === "loading"
                ? "Creating Profile..."
                : "Create Account"}
            </button>
          </form>

          <p className="ct-auth-footer-text">
            Already have an account?{" "}
            <button
              type="button"
              className="ct-inline-link-btn"
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default observer(RegisterPage);
