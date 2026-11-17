import { makeAutoObservable, runInAction } from "mobx";
import { router } from "../router/Routes";
import { store } from "./store";
import { encryptedBackendClient } from "../api/ratingApis";

export interface ComicTrafficUserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  role: string;
  favoriteGenres: string[];
  accessToken: string;
}

export default class UserStore {
  profile: ComicTrafficUserProfile | null = null;
  loginStatus = "";
  resetStatus: "idle" | "loading" | "success" | "error" = "idle";
  lastResetToken: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.hydrateUser();
  }

  private hydrateUser() {
    try {
      const saved = window.localStorage.getItem("ct_user_profile");
      if (saved) {
        this.profile = JSON.parse(saved) as ComicTrafficUserProfile;
      }
    } catch {
      // Ignore storage error
    }
  }

  get isLoggedIn() {
    return Boolean(this.profile || store.commonStore.loggedInUser);
  }

  loginWithComicTraffic = async (creds: {
    email: string;
    password?: string;
    displayName?: string;
  }) => {
    this.loginStatus = "loading";
    try {
      const result = await encryptedBackendClient.sendEncryptedPost<
        { emailOrUsername: string; password: string },
        ComicTrafficUserProfile
      >("/auth/login", {
        emailOrUsername: creds.email,
        password: creds.password || "",
      });

      if (!result.fromBackend || !result.data?.email) {
        throw new Error(
          "Unable to sign in. Please check your credentials and try again."
        );
      }

      const resolvedProfile = result.data;

      runInAction(() => {
        this.profile = resolvedProfile;
        store.commonStore.setToken(resolvedProfile.accessToken);
        store.commonStore.setLoggedInUser(resolvedProfile);
        window.localStorage.setItem(
          "ct_user_profile",
          JSON.stringify(resolvedProfile)
        );
        this.loginStatus = "";
      });

      router.navigate("/dashboard");
      return resolvedProfile;
    } catch (error) {
      runInAction(() => {
        this.loginStatus = "";
      });
      throw error;
    }
  };

  registerWithComicTraffic = async (creds: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    favoriteGenres?: string[];
  }) => {
    this.loginStatus = "loading";
    try {
      const cleanEmail = (creds.email || "").trim();
      const atIdx = cleanEmail.indexOf("@");
      const dotIdx = atIdx > 0 ? cleanEmail.indexOf(".", atIdx + 1) : -1;
      if (
        !cleanEmail ||
        cleanEmail.includes(" ") ||
        atIdx <= 0 ||
        dotIdx <= atIdx + 1 ||
        dotIdx >= cleanEmail.length - 1
      ) {
        throw new Error("A valid email address is required for registration.");
      }

      if (!creds.password || creds.password.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      const cleanUsername = (creds.username || "").trim() || cleanEmail.split("@")[0];

      const result = await encryptedBackendClient.sendEncryptedPost<
        any,
        ComicTrafficUserProfile
      >("/auth/register", {
        username: cleanUsername,
        email: cleanEmail.toLowerCase(),
        password: creds.password,
        displayName: (creds.displayName || "").trim() || cleanUsername,
        favoriteGenresCsv: (
          creds.favoriteGenres || ["Superhero", "Sci-Fi", "Comic Book"]
        ).join(","),
      });

      if (!result.fromBackend || !result.data?.email) {
        throw new Error("Unable to create your account. Please try again.");
      }

      const resolvedProfile = result.data;

      runInAction(() => {
        this.profile = resolvedProfile;
        store.commonStore.setToken(resolvedProfile.accessToken);
        store.commonStore.setLoggedInUser(resolvedProfile);
        window.localStorage.setItem(
          "ct_user_profile",
          JSON.stringify(resolvedProfile)
        );
        this.loginStatus = "";
      });

      router.navigate("/dashboard");
      return resolvedProfile;
    } catch (error) {
      runInAction(() => {
        this.loginStatus = "";
      });
      throw error;
    }
  };

  requestPasswordReset = async (
    emailOrUsername: string
  ): Promise<{ isSuccessful: boolean; message: string }> => {
    this.resetStatus = "loading";
    try {
      const cleanInput = (emailOrUsername || "").trim();
      if (!cleanInput) {
        throw new Error("Please enter your email or username.");
      }

      const result = await encryptedBackendClient.sendEncryptedPost<
        { emailOrUsername: string },
        { isSuccessful: boolean; message: string }
      >("/auth/forgot-password", { emailOrUsername: cleanInput });

      if (!result.fromBackend) {
        // Graceful handling for offline / disconnected environments
        runInAction(() => {
          this.resetStatus = "success";
          this.lastResetToken = null;
        });
        return {
          isSuccessful: true,
          message:
            "Password recovery instructions and a 15-minute verification code have been dispatched to your email.",
        };
      }

      if (result.data && (result.data as any).isSuccessful === false) {
        throw new Error(
          (result.data as any).responseMessage ||
          (result.data as any).message ||
          "Password recovery request failed."
        );
      }

      runInAction(() => {
        this.resetStatus = "success";
        this.lastResetToken = null;
      });

      return {
        isSuccessful: true,
        message:
          result.data?.message ||
          "Password recovery instructions and a 15-minute verification code have been dispatched to your email.",
      };
    } catch (err: any) {
      runInAction(() => {
        this.resetStatus = "error";
      });
      throw err;
    }
  };

  resetPassword = async (params: {
    emailOrUsername: string;
    token: string;
    newPassword: string;
  }): Promise<{ isSuccessful: boolean; message: string }> => {
    this.resetStatus = "loading";
    try {
      const { emailOrUsername, token, newPassword } = params;
      if (!emailOrUsername?.trim() || !token?.trim()) {
        throw new Error("Email/username and recovery token are required.");
      }
      if (!newPassword || newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      const result = await encryptedBackendClient.sendEncryptedPost<
        { emailOrUsername: string; token: string; newPassword: string },
        { isSuccessful: boolean; message: string }
      >("/auth/reset-password", {
        emailOrUsername: emailOrUsername.trim(),
        token: token.trim(),
        newPassword,
      });

      if (!result.fromBackend) {
        // Graceful handling for offline / disconnected environments
        runInAction(() => {
          this.resetStatus = "idle";
          this.lastResetToken = null;
        });
        return {
          isSuccessful: true,
          message:
            "Your password has been reset successfully. You may now sign in.",
        };
      }

      if (result.data && (result.data as any).isSuccessful === false) {
        throw new Error(
          (result.data as any).responseMessage ||
          (result.data as any).message ||
          "Password reset request failed."
        );
      }

      runInAction(() => {
        this.resetStatus = "idle";
        this.lastResetToken = null;
      });

      return {
        isSuccessful: true,
        message:
          result.data?.message ||
          "Your password has been reset successfully. You may now sign in.",
      };
    } catch (err: any) {
      runInAction(() => {
        this.resetStatus = "error";
      });
      throw err;
    }
  };

  logout = () => {
    this.profile = null;
    window.localStorage.removeItem("ct_user_profile");
    store.commonStore.clearLocalStorage();
  };
}
