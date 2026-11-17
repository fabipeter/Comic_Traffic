import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../app/stores/store";
import Nav from "../../home/Nav";

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userStore } = useStore();

  const queryEmail = searchParams.get("email") || "";
  const queryToken = searchParams.get("token") || "";

  // Step 1 = Request Code, Step 2 = Enter Code & New Password, Step 3 = Success
  const [step, setStep] = useState<1 | 2 | 3>(queryToken ? 2 : 1);
  const [emailOrUsername, setEmailOrUsername] = useState(queryEmail);
  const [token, setToken] = useState(queryToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Auto-jump to Step 2 if query params provide token & email
  useEffect(() => {
    if (queryToken) {
      setToken(queryToken);
      if (queryEmail) {
        setEmailOrUsername(queryEmail);
      }
      setStep(2);
      setInfoMessage("Verification link verified from email. Please enter your new password below.");
      // Remove recovery token & email from browser URL bar / history immediately
      if (typeof window !== "undefined" && window.history?.replaceState) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [queryToken, queryEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");
    if (!emailOrUsername.trim()) {
      setErrorMessage("Please enter your email address or username.");
      return;
    }

    try {
      const res = await userStore.requestPasswordReset(emailOrUsername);
      setInfoMessage(res.message);
      setStep(2);
      setResendCooldown(45);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Failed to dispatch recovery code. Please try again."
      );
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !emailOrUsername.trim()) return;
    setErrorMessage("");
    try {
      const res = await userStore.requestPasswordReset(emailOrUsername);
      setInfoMessage(`New verification code sent! ${res.message}`);
      setResendCooldown(45);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Unable to resend code. Please try again shortly."
      );
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");

    if (!token.trim()) {
      setErrorMessage("Please enter the 15-minute verification code from your email.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    try {
      const res = await userStore.resetPassword({
        emailOrUsername,
        token,
        newPassword,
      });
      setInfoMessage(res.message);
      setStep(3);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Unable to reset password. Please check your verification code and try again."
      );
    }
  };

  return (
    <div className="ct-auth-page">
      <Nav />
      <div className="ct-auth-card-wrapper">
        <div className="ct-auth-card">
          <div className="ct-auth-badge">
            🛡️ Comic Traffic Account Security
          </div>

          {step !== 3 && (
            <>
              <h2>Reset Your Password</h2>
              <p className="ct-auth-subtitle">
                {step === 1
                  ? "Enter your registered email address or username. We will dispatch a 15-minute verification code to your inbox."
                  : "Enter the verification code dispatched to your email and select your new password."}
              </p>

              {/* Progress Stepper */}
              <div className="ct-recovery-stepper">
                <button
                  type="button"
                  className={`ct-stepper-tab ${step === 1 ? "active" : "completed"}`}
                  onClick={() => setStep(1)}
                >
                  <span className="ct-stepper-num">1</span>
                  <span>Email Verification</span>
                </button>
                <span className="ct-stepper-arrow">→</span>
                <button
                  type="button"
                  className={`ct-stepper-tab ${step === 2 ? "active" : ""}`}
                  onClick={() => {
                    if (emailOrUsername.trim()) setStep(2);
                  }}
                >
                  <span className="ct-stepper-num">2</span>
                  <span>Set New Password</span>
                </button>
              </div>
            </>
          )}

          {errorMessage && (
            <div className="ct-auth-error" role="alert">
              ⚠️ {errorMessage}
            </div>
          )}

          {infoMessage && step !== 3 && (
            <div className="ct-auth-info-banner" role="status">
              ✓ {infoMessage}
            </div>
          )}

          {/* Step 1: Request Code Form */}
          {step === 1 && (
            <form onSubmit={handleRequestCode} className="ct-auth-form">
              <div className="ct-form-field">
                <label htmlFor="ct-recovery-email">Registered Email or Username</label>
                <input
                  id="ct-recovery-email"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="e.g. you@example.com or comicwarden"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="ct-primary-cta-btn ct-full-btn"
                disabled={userStore.resetStatus === "loading"}
              >
                {userStore.resetStatus === "loading"
                  ? "Dispatching Verification Email..."
                  : "Send Verification Code"}
              </button>

              <div className="ct-recovery-switch-row">
                <span>Already received a code via email?</span>
                <button
                  type="button"
                  className="ct-inline-link-btn"
                  onClick={() => setStep(2)}
                >
                  Enter Code & Reset →
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Verify Token & Set New Password */}
          {step === 2 && (
            <form onSubmit={handleResetPassword} className="ct-auth-form">
              <div className="ct-form-field">
                <label htmlFor="ct-recovery-target-user">Email or Username</label>
                <input
                  id="ct-recovery-target-user"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="ct-form-field">
                <div className="ct-form-field-header">
                  <label htmlFor="ct-recovery-token">15-Minute Verification Code</label>
                  <button
                    type="button"
                    className="ct-inline-link-btn"
                    disabled={resendCooldown > 0 || !emailOrUsername.trim()}
                    onClick={handleResendCode}
                    style={{ fontSize: "0.74rem" }}
                  >
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
                <input
                  id="ct-recovery-token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="Enter verification code"
                  required
                  autoFocus
                />
              </div>

              <div className="ct-form-field">
                <div className="ct-form-field-header">
                  <label htmlFor="ct-new-password">New Password</label>
                  <button
                    type="button"
                    className="ct-inline-link-btn ct-show-pwd-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  id="ct-new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </div>

              <div className="ct-form-field">
                <label htmlFor="ct-confirm-password">Confirm New Password</label>
                <input
                  id="ct-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="ct-primary-cta-btn ct-full-btn"
                disabled={userStore.resetStatus === "loading"}
              >
                {userStore.resetStatus === "loading"
                  ? "Verifying & Updating Password..."
                  : "Update Password & Continue"}
              </button>

              <div className="ct-recovery-switch-row">
                <button
                  type="button"
                  className="ct-inline-link-btn"
                  onClick={() => setStep(1)}
                >
                  ← Back to Email Request
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Success Confirmation */}
          {step === 3 && (
            <div className="ct-recovery-success-box">
              <div className="ct-recovery-success-icon">✓</div>
              <h2>Password Updated Successfully!</h2>
              <p>
                The password for <strong>{emailOrUsername}</strong> has been
                securely updated in the database. A confirmation email has been
                dispatched to your inbox.
              </p>
              <button
                type="button"
                className="ct-primary-cta-btn ct-full-btn"
                onClick={() => navigate("/login")}
              >
                Sign In to Comic Traffic
              </button>
            </div>
          )}

          <p className="ct-auth-footer-text">
            Remember your credentials?{" "}
            <button
              type="button"
              className="ct-inline-link-btn"
              onClick={() => navigate("/login")}
            >
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default observer(ForgotPasswordPage);
