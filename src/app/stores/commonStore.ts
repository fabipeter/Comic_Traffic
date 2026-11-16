import { makeAutoObservable, reaction } from "mobx";

export default class CommonStore {
  token: string | null = localStorage.getItem("jwt");
  appLoaded = false;
  loggedInUser: any | null = JSON.parse(
    window.localStorage.getItem("user") || "null"
  );

  constructor() {
    makeAutoObservable(this);

    reaction(
      () => this.token,
      (token) => {
        if (token) {
          localStorage.setItem("jwt", token);
        } else {
          localStorage.removeItem("jwt");
        }
      }
    );

    reaction(
      () => this.loggedInUser,
      (loggedInUser) => {
        if (loggedInUser) {
          window.localStorage.setItem("user", JSON.stringify(loggedInUser));
        } else {
          window.localStorage.removeItem("user");
        }
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
    window.localStorage.removeItem("jwt");
    window.localStorage.removeItem("user");
  }
}
