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

export default class UserStore {
  user: User | null = null;
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
  }

  get isLoggedIn() {
    return !!this.user;
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
  getEligibility = async (creds: VendorScoreForm) => {
    this.setLoadingScore(true);
    try {
      const response = await agent.Account.getEligibility(creds);
      // store.commonStore.setToken(user.token);
      runInAction(() => {
        this.scoreResponse = response;
      });
      this.setLoadingScore(false);
    } catch (error) {
      this.setLoadingScore(false);
      throw error;
    }
  };
  getCategories = async () => {
    this.setStatus("loading");
    try {
      const response = await agent.Account.getCategories();
      // store.commonStore.setToken(user.token);
      runInAction(() => {
        if (response.data === null) {
          this.userProductCategories = [];
        } else this.userProductCategories = response.data;
      });
      this.setStatus("idle");
    } catch (error) {
      this.setStatus("idle");
      throw error;
    }
  };
  getStates = async () => {
    this.setStatus("loading");
    try {
      const response = await agent.Account.getStateCodes();
      // store.commonStore.setToken(user.token);
      runInAction(() => {
        this.userStates = response.data;
      });
      this.setStatus("idle");
    } catch (error) {
      this.setStatus("idle");
      throw error;
    }
  };

  getAccountInfo = async () => {
    this.setStatus("loading");
    try {
      const response = await agent.Account.getAccountInfo();
      // store.commonStore.setToken(user.token);
      // console.log(response);
      if (response.isSuccessful) {
        runInAction(() => {
          this.accountInformation = response.data;
        });
      } else {
        toast.error(response.responseMessage);
      }
      this.setStatus("");
      return response;
    } catch (error) {
      this.setStatus("");
      throw error;
    }
  };

  login = async (creds: UserFormValues) => {
    this.loginStatus = "loading";
    // toast.info("Check toast")
    try {
      const user = await agent.Account.login(creds);
      // console.log(user);
      if (user.isSuccessful) {
        store.commonStore.setToken(user.data.access_token);
        store.commonStore.setLoggedInUser(user.data);
        runInAction(() => (this.loginStatus = ""));
        router.navigate(-1);
      } else if (user.responseCode === "04") {
        throw user.responseMessage;
      } else {
        runInAction(() => (this.loginStatus = ""));
        const error = "Invalid Credentials";
        throw error;
      }
      // store.modalStore.closeModal();
    } catch (error) {
      this.loginStatus = "";
      var error2 = "Problem validating credentials";
      // console.log(error);
      if (typeof error === typeof "") throw error;
      else throw error2;
    }
  };

  register = async (creds: VendorRegistrationForm) => {
    this.registerIsSuccess = "loading";
    try {
      const user = await agent.Account.register(creds);
      if (user.isSuccessful) {
        runInAction(() => (this.registerIsSuccess = "success"));
      } else
        runInAction(() => {
          this.registerIsSuccess = "";
          toast.info(user.responseMessage);
        });

      //   router.navigate("/activities");
      //   store.modalStore.closeModal();
    } catch (error) {
      this.registerIsSuccess = "";
      throw error;
    }
  };

  updateVendor = async (creds: VendorUpdateForm) => {
    this.status = "loading";
    try {
      const response = await agent.Account.updateAccountInfo(creds);
      toast.info(response.responseMessage);
      runInAction(() => (this.status = ""));
      return response;

      //   router.navigate("/activities");
      //   store.modalStore.closeModal();
    } catch (error) {
      this.status = "";
      throw error;
    }
  };

  forgotPassword = async (creds: string) => {
    this.loginStatus = "loading";
    try {
      const response = await agent.Account.forgotPassword(creds);
      // console.log(response);
      runInAction(() => (this.loginStatus = ""));
      return response;
      // if (response.isSuccessful) {
      //   runInAction(() => (this.loginStatus = ""));
      //   return "success";
      // } else {
      //   runInAction(() => (this.loginStatus = ""));
      //   return response.responseMessage;
      // }
      // store.modalStore.closeModal();
    } catch (error) {
      this.loginStatus = "";
      throw error;
    }
  };

  verifyOtp = async (creds: PasswordOtpData) => {
    this.loginStatus = "loading";
    try {
      const response = await agent.Account.verifyPasswordOtp(creds);
      // console.log(response);
      runInAction(() => (this.loginStatus = ""));
      return response;
      // if (response.isSuccessful) {
      //   runInAction(() => (this.loginStatus = ""));
      //   return response;
      // } else {
      //   runInAction(() => (this.loginStatus = ""));
      //   return response.responseMessage
      // }
      // store.modalStore.closeModal();
    } catch (error) {
      this.loginStatus = "";
      throw error;
    }
  };

  changePassword = async (creds: PasswordChangeForm) => {
    this.loginStatus = "loading";
    try {
      const response = await agent.Account.changePassword(creds);
      // console.log(response);
      runInAction(() => (this.loginStatus = ""));
      return response;
      // if (response.data) {
      //   runInAction(() => (this.loginStatus = ""));
      //   return "success";
      // } else {
      //   runInAction(() => (this.loginStatus = ""));
      //   const error = "Invalid Credentials";
      //   throw error;
      // }
      // store.modalStore.closeModal();
    } catch (error) {
      this.loginStatus = "";
      throw error;
    }
  };

  verifyEmail = async (creds: string) => {
    this.emailStatus = "loading";
    try {
      const response = await agent.Account.verifyEmail(creds);
      // console.log(response);

      if (response.isSuccessful) {
        runInAction(() => (this.emailStatus = ""));
        return "success";
      } else {
        runInAction(() => (this.emailStatus = ""));
        const error = "Invalid Credentials";
        throw error;
      }
      // store.modalStore.closeModal();
    } catch (error) {
      this.emailStatus = "";
      throw error;
    }
  };

  logout = () => {
    store.commonStore.clearLocalStorage();
    // this.user = null;
    // router.navigate("/");
  };

  getUser = async () => {
    try {
      // const user = await agent.Account.current();
      // runInAction(() => this.user = user);
    } catch (error) {
      console.log(error);
    }
  };

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
