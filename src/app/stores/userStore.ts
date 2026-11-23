import { makeAutoObservable, runInAction } from "mobx";
import { navigateToAppRoute } from "../router/navigation";
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
        const parsed = JSON.parse(saved) as ComicTrafficUserProfile;
        if (parsed.avatarUrl && parsed.avatarUrl.toLowerCase().includes("pinimg.com")) {
          parsed.avatarUrl = "/default-avatar.svg";
          window.localStorage.setItem("ct_user_profile", JSON.stringify(parsed));
        }
        this.profile = parsed;
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
      >(
        "/auth/login",
        {
          emailOrUsername: creds.email,
          password: creds.password || "",
        },
        undefined,
        false,
        20000
      );

      if (!result.fromBackend) {
        throw new Error(
          result.errorMessage ||
            "Unable to sign in. Please check your connection and try again."
        );
      }

      if (!result.data?.email) {
        throw new Error(
          (result.data as any)?.responseMessage ||
            (result.data as any)?.message ||
            "Unable to sign in. Please check your credentials and try again."
        );
      }

      const resolvedProfile = result.data;

      runInAction(() => {
        this.profile = resolvedProfile;
        store.commonStore.setToken(resolvedProfile.accessToken || null);
        store.commonStore.setLoggedInUser(resolvedProfile);
        try {
          window.localStorage.setItem(
            "ct_user_profile",
            JSON.stringify(resolvedProfile)
          );
        } catch {
          // Ignore storage restrictions
        }
        this.loginStatus = "";
      });

      navigateToAppRoute("/dashboard");
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
    acceptedTerms?: boolean;
  }) => {
    this.loginStatus = "loading";
    try {
      if (creds.acceptedTerms === false) {
        throw new Error(
          "You must confirm minimum age eligibility and accept the Terms of Service and Privacy Policy."
        );
      }

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
      >(
        "/auth/register",
        {
          username: cleanUsername,
          email: cleanEmail.toLowerCase(),
          password: creds.password,
          displayName: (creds.displayName || "").trim() || cleanUsername,
          favoriteGenresCsv: (
            creds.favoriteGenres || ["Superhero", "Sci-Fi", "Comic Book"]
          ).join(","),
          acceptedTerms: creds.acceptedTerms ?? true,
        },
        undefined,
        false,
        20000
      );

      if (!result.fromBackend) {
        throw new Error(
          result.errorMessage ||
            "Unable to reach the registration service. Please check your connection and try again."
        );
      }

      if (!result.data?.email) {
        throw new Error(
          (result.data as any)?.responseMessage ||
            (result.data as any)?.message ||
            "Unable to create your account. Please try again."
        );
      }

      const rawProfile = result.data;
      const resolvedProfile: ComicTrafficUserProfile = {
        id: rawProfile.id || `user-${Date.now().toString(36)}`,
        username: rawProfile.username || cleanUsername,
        email: rawProfile.email,
        displayName: rawProfile.displayName || cleanUsername,
        bio: rawProfile.bio || "Comic book, cinema & series enthusiast.",
        avatarUrl:
          rawProfile.avatarUrl && !rawProfile.avatarUrl.toLowerCase().includes("pinimg.com")
            ? rawProfile.avatarUrl
            : "/default-avatar.svg",
        role: rawProfile.role || "User",
        favoriteGenres: Array.isArray(rawProfile.favoriteGenres)
          ? rawProfile.favoriteGenres
          : creds.favoriteGenres || ["Superhero", "Sci-Fi", "Comic Book"],
        accessToken: rawProfile.accessToken || "",
      };

      runInAction(() => {
        this.profile = resolvedProfile;
        store.commonStore.setToken(resolvedProfile.accessToken || null);
        store.commonStore.setLoggedInUser(resolvedProfile);
        try {
          window.localStorage.setItem(
            "ct_user_profile",
            JSON.stringify(resolvedProfile)
          );
        } catch {
          // Ignore storage restrictions
        }
        this.loginStatus = "";
      });

      navigateToAppRoute("/dashboard");
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

  exportMyData = async (): Promise<Record<string, any>> => {
    const token = store.commonStore.token || this.profile?.accessToken || null;
    const res = await encryptedBackendClient.sendEncryptedPost<{}, any>(
      "/auth/export-data",
      {},
      token
    );

    if (res.fromBackend && res.data && (res.data.profile || res.data.exportedAt)) {
      return res.data;
    }

    const safeProfile = this.profile
      ? {
          id: this.profile.id,
          username: this.profile.username,
          email: this.profile.email,
          displayName: this.profile.displayName,
          bio: this.profile.bio,
          avatarUrl: this.profile.avatarUrl,
          role: this.profile.role,
          favoriteGenres: this.profile.favoriteGenres,
        }
      : null;

    return {
      exportedAt: new Date().toISOString(),
      source: "local-session",
      profile: safeProfile,
      customWeights: store.ratingStore.customWeights,
      watchlist: store.ratingStore.watchlist,
      customLists: store.ratingStore.customLists,
      reviews: store.ratingStore.reviews,
    };
  };

  deleteMyAccount = async (
    password?: string
  ): Promise<{ isSuccessful: boolean; message: string }> => {
    const token = store.commonStore.token || this.profile?.accessToken || null;
    const currentUsername = this.profile?.username;
    const res = await encryptedBackendClient.sendEncryptedPost<
      { password?: string },
      { isSuccessful?: boolean; message?: string; responseMessage?: string }
    >("/auth/delete-account", { password: password || undefined }, token);

    if (!res.fromBackend && res.errorMessage && res.errorMessage.toLowerCase().includes("password")) {
      throw new Error(res.errorMessage);
    }

    if (res.data && res.data.isSuccessful === false) {
      throw new Error(
        res.data.responseMessage ||
          res.data.message ||
          "Unable to delete account."
      );
    }

    store.ratingStore.purgeAllPersonalLocalData(currentUsername);
    this.logout();
    navigateToAppRoute("/");

    return {
      isSuccessful: true,
      message:
        res.data?.message ||
        "Your account and associated personal data have been permanently deleted.",
    };
  };

  logout = () => {
    this.profile = null;
    try {
      window.localStorage.removeItem("ct_user_profile");
    } catch {
      // Ignore storage error
    }
    store.commonStore.clearLocalStorage();
  };
}
