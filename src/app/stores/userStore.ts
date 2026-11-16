import { makeAutoObservable, runInAction } from "mobx";
import agent from "../api/agent";
import {
  ProductCategory,
  States,
  User,
  UserFormValues,
  VendorScoreForm,
  VendorsResponse,
  VendorRegistrationForm,
  PasswordChangeForm,
  PasswordOtpData,
  AccountInformation,
  VendorUpdateForm,
} from "../models/user";
import { router } from "../router/Routes";
import { store } from "./store";
import { toast } from "react-toastify";
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

const DEFAULT_DEMO_USER: ComicTrafficUserProfile = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "comicwarden",
  email: "demo@comictraffic.io",
  displayName: "Alex Mercer (ComicWarden)",
  bio: "Cumulative rating analyst, graphic novel collector, and sci-fi cinema critic.",
  avatarUrl:
    "https://i.pinimg.com/originals/95/8e/e6/958ee665c32ab3bbc9b3365f05c49c85.png",
  role: "Admin",
  favoriteGenres: ["Superhero", "Sci-Fi", "Noir", "Graphic Novel", "Animation"],
  accessToken: "ct-encrypted-jwt-session-token-2026",
};

export default class UserStore {
  user: User | null = null;
  profile: ComicTrafficUserProfile | null = null;
  loadingScore = true;
  scoreResponse: VendorsResponse | null = null;
  registerIsSuccess = "";
  status = "";
  userProductCategories: ProductCategory[] = [];
  userStates: States[] = [];
  loginStatus = "";
  emailStatus = "";
  accountInformation: AccountInformation = new AccountInformation();

  constructor() {
    makeAutoObservable(this);
    this.hydrateUser();
  }

  private hydrateUser() {
    try {
      const saved = window.localStorage.getItem("ct_user_profile");
      if (saved) {
        const parsed = JSON.parse(saved) as ComicTrafficUserProfile;
        this.profile = parsed;
        this.user = {
          username: parsed.username,
          displayName: parsed.displayName,
          token: parsed.accessToken,
          image: parsed.avatarUrl,
        };
      }
    } catch {
      // Ignore storage error
    }
  }

  get isLoggedIn() {
    return Boolean(this.profile || this.user || store.commonStore.loggedInUser);
  }

  setLoadingScore = (state: boolean) => {
    this.loadingScore = state;
  };
  setRegisterIsSuccess = (state: string) => {
    this.registerIsSuccess = state;
  };
  setStatus = (state: string) => {
    this.status = state;
  };
  setLoginStatus = (state: string) => {
    this.loginStatus = state;
  };

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
        password: creds.password || "ComicTraffic123!",
      });

      const resolvedProfile: ComicTrafficUserProfile =
        result.fromBackend && result.data && result.data.email
          ? result.data
          : {
              ...DEFAULT_DEMO_USER,
              email: creds.email || DEFAULT_DEMO_USER.email,
              username: (creds.email || "comicwarden").split("@")[0],
              displayName:
                creds.displayName ||
                (creds.email === DEFAULT_DEMO_USER.email
                  ? DEFAULT_DEMO_USER.displayName
                  : (creds.email || "ComicWarden").split("@")[0]),
            };

      runInAction(() => {
        this.profile = resolvedProfile;
        this.user = {
          username: resolvedProfile.username,
          displayName: resolvedProfile.displayName,
          token: resolvedProfile.accessToken,
          image: resolvedProfile.avatarUrl,
        };
        store.commonStore.setToken(resolvedProfile.accessToken);
        store.commonStore.setLoggedInUser(resolvedProfile);
        store.ratingStore.encryptionLogs = [...encryptedBackendClient.logs];
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
        favoriteGenresCsv: (creds.favoriteGenres || ["Superhero", "Sci-Fi", "Comic Book"]).join(","),
      });

      const resolvedProfile: ComicTrafficUserProfile =
        result.fromBackend && result.data && result.data.email
          ? result.data
          : {
              id: `usr-${Date.now()}`,
              username: creds.username || creds.email.split("@")[0],
              email: creds.email,
              displayName: creds.displayName || creds.username || creds.email.split("@")[0],
              bio: "ComicTraffic member & cumulative rating contributor.",
              avatarUrl: DEFAULT_DEMO_USER.avatarUrl,
              role: "User",
              favoriteGenres: creds.favoriteGenres || [
                "Superhero",
                "Sci-Fi",
                "Graphic Novel",
              ],
              accessToken: `ct-jwt-${Date.now()}`,
            };

      runInAction(() => {
        this.profile = resolvedProfile;
        this.user = {
          username: resolvedProfile.username,
          displayName: resolvedProfile.displayName,
          token: resolvedProfile.accessToken,
          image: resolvedProfile.avatarUrl,
        };
        store.commonStore.setToken(resolvedProfile.accessToken);
        store.commonStore.setLoggedInUser(resolvedProfile);
        store.ratingStore.encryptionLogs = [...encryptedBackendClient.logs];
        window.localStorage.setItem(
          "ct_user_profile",
          JSON.stringify(resolvedProfile)
        );
        this.registerIsSuccess = "success";
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

  loginAsDemoUser = async () => {
    return this.loginWithComicTraffic({
      email: DEFAULT_DEMO_USER.email,
      password: "ComicTraffic123!",
      displayName: DEFAULT_DEMO_USER.displayName,
    });
  };

  updateProfileDetails = async (updates: {
    displayName: string;
    bio: string;
    favoriteGenres: string[];
  }) => {
    const current = this.profile || DEFAULT_DEMO_USER;
    const updated: ComicTrafficUserProfile = {
      ...current,
      displayName: updates.displayName,
      bio: updates.bio,
      favoriteGenres: updates.favoriteGenres,
    };

    await encryptedBackendClient.sendEncryptedPost("/auth/preferences", {
      userId: updated.id,
      displayName: updated.displayName,
      bio: updated.bio,
      favoriteGenresCsv: updated.favoriteGenres.join(","),
    });

    runInAction(() => {
      this.profile = updated;
      store.commonStore.setLoggedInUser(updated);
      store.ratingStore.encryptionLogs = [...encryptedBackendClient.logs];
      window.localStorage.setItem("ct_user_profile", JSON.stringify(updated));
    });
  };

  login = async (creds: UserFormValues) => {
    return this.loginWithComicTraffic({
      email: creds.email,
      password: creds.password,
    });
  };

  register = async (creds: VendorRegistrationForm) => {
    return this.registerWithComicTraffic({
      username: creds.email.split("@")[0],
      email: creds.email,
      password: (creds as any).password || "ComicTraffic123!",
      displayName: `${(creds as any).firstName || ""} ${(creds as any).lastName || ""}`.trim(),
    });
  };

  logout = () => {
    this.profile = null;
    this.user = null;
    window.localStorage.removeItem("ct_user_profile");
    store.commonStore.clearLocalStorage();
  };

  getEligibility = async (creds: VendorScoreForm) => {
    this.setLoadingScore(true);
    try {
      const response = await agent.Account.getEligibility(creds);
      runInAction(() => {
        this.scoreResponse = response;
      });
      this.setLoadingScore(false);
    } catch (error) {
      this.setLoadingScore(false);
      throw error;
    }
  };

  getCategories = async () => {};
  getStates = async () => {};
  getAccountInfo = async () => {};
  updateVendor = async (creds: VendorUpdateForm) => {};
  forgotPassword = async (creds: string) => {};
  verifyOtp = async (creds: PasswordOtpData) => {};
  changePassword = async (creds: PasswordChangeForm) => {};
  verifyEmail = async (creds: string) => {};
  getUser = async () => {};

  setImage = (image: string) => {
    if (this.user) this.user.image = image;
  };
  setUserPhoto = (url: string) => {
    if (this.user) this.user.image = url;
  };
  setDisplayName = (name: string) => {
    if (this.user) this.user.displayName = name;
  };
}
