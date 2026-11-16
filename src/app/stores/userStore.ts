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
      const result = await encryptedBackendClient.sendEncryptedPost<
        any,
        ComicTrafficUserProfile
      >("/auth/register", {
        username: creds.username,
        email: creds.email,
        password: creds.password,
        displayName: creds.displayName || creds.username,
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

  logout = () => {
    this.profile = null;
    window.localStorage.removeItem("ct_user_profile");
    store.commonStore.clearLocalStorage();
  };
}
