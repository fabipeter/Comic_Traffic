import { makeAutoObservable, reaction, runInAction } from "mobx";
// import { ServerError } from "../models/serverError";
import { UserProfile } from "../models/user";
import { toast } from "react-toastify";
import { router } from "../router/Routes";
import jwt_decode from "jwt-decode";
import agent from "../api/agent";
import { store } from "./store";

export default class CommonStore {
//   error: ServerError | null = null;
  token: string | null = localStorage.getItem("jwt");
  appLoaded = false;
  loggedInUser: UserProfile | null = JSON.parse(
    window.localStorage.getItem("user")!
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

    // reaction(
    //   () => this.refreshToken,
    //   (refreshToken) => {
    //     if (refreshToken) {
    //       window.localStorage.setItem("refreshToken", refreshToken);
    //     } else {
    //       window.localStorage.removeItem("refreshToken");
    //     }
    //   }
    // );

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
    return !!this.loggedInUser;
  }

  remainingTime() {
    const accessToken = localStorage.getItem("jwt");
    // console.log(accessToken)
    if (accessToken) {
      const decoded = JSON.parse(JSON.stringify(jwt_decode(accessToken)));
      let tokenExpDate = new Date(decoded.exp * 1000).getTime() - Date.now();
      // console.log(tokenExpDate)
      return tokenExpDate;
    } else return 0;
  }
//   setServerError(error: ServerError) {
//     this.error = error;
//   }

  setToken = (token: string | null) => {
    this.token = token;
  };
  setLoggedInUser = (user: any | null) => {
    this.loggedInUser = user;
  };
  setAppLoaded = () => {
    this.appLoaded = true;
  };

  tokenRefresh = async () => {
    try {
      if (this.loggedInUser && this.loggedInUser.refresh_token) {
        const payload = {
          userId: this.loggedInUser.userId,
          refreshToken: this.token,
        };
        const response = await agent.Account.refreshToken(payload);
        runInAction(() => {
          if (response.isSuccessful) {
            const { accessToken } = response.data;
            this.setToken(accessToken);
            window.localStorage.setItem("jwt", accessToken);
          } else {
            store.userStore.logout();
            toast.info("Your session has expired, please login again");
          }
        });
      }
    } catch (error) {
      // this.setStatus("idle");
      throw error;
    }
  };
  clearLocalStorage() {
    this.loggedInUser = null;
    this.token = null;
    window.localStorage.removeItem("jwt");
    window.localStorage.removeItem("refreshToken");
    window.localStorage.removeItem("mToken");
    window.localStorage.removeItem("user");
    window.localStorage.removeItem("profileStatus");
    router.navigate("/");
    // toast.info("Your session has expired, please login again");
  }
}
