import { makeAutoObservable, reaction } from "mobx";

function readStorageSafe(key: string): string | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function writeStorageSafe(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or Safari private-mode restrictions
  }
}

function parseUserSafe(raw: string | null): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default class CommonStore {
  token: string | null = readStorageSafe("jwt");
  appLoaded = false;
  loggedInUser: any | null = parseUserSafe(readStorageSafe("user"));

  constructor() {
    makeAutoObservable(this);

    reaction(
      () => this.token,
      (token) => {
        writeStorageSafe("jwt", token);
      }
    );

    reaction(
      () => this.loggedInUser,
      (loggedInUser) => {
        writeStorageSafe(
          "user",
          loggedInUser ? JSON.stringify(loggedInUser) : null
        );
      }
    );
  }

  get isLoggedIn() {
    return Boolean(this.loggedInUser);
  }

  setToken = (token: string | null) => {
    this.token = token;
  };

  setLoggedInUser = (user: any | null) => {
    this.loggedInUser = user;
  };

  setAppLoaded = () => {
    this.appLoaded = true;
  };

  clearLocalStorage() {
    this.loggedInUser = null;
    this.token = null;
    writeStorageSafe("jwt", null);
    writeStorageSafe("user", null);
  }
}
