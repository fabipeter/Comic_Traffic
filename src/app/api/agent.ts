import axios, { AxiosError, AxiosResponse } from "axios";
import { toast } from "react-toastify";
import { router } from "../router/Routes";
import { store } from "../stores/store";

// const sleep = (delay: number) => {
//   return new Promise((resolve) => {
//     setTimeout(resolve, delay);
//   });
// };

axios.defaults.baseURL = process.env.REACT_APP_API_URL;

const responseBody = <T>(response: AxiosResponse<T>) => response.data;

axios.interceptors.request.use((config) => {
  const token = store.commonStore.token;
  if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  async (response) => {
    // if (process.env.NODE_ENV === "development") await sleep(1000);
    // const pagination = response.headers["pagination"];
    // if (pagination) {
    //   response.data = new PaginatedResult(
    //     response.data,
    //     JSON.parse(pagination)
    //   );
    //   return response as AxiosResponse<PaginatedResult<any>>;
    // }
    return response;
  },
  (error: AxiosError) => {
    try {
      console.log(error);
      const { status, config, headers } = error.response as AxiosResponse;
      const headerContent: string = `${headers["www-authenticate"]}`;
      // console.log(error.response);
      switch (status) {
        case 400:
          // if (config.method === "get" && data.errors.hasOwnProperty("id")) {
          //   router.navigate("/not-found");
          // }
          // if (data.errors) {
          //   const modalStateErrors = [];
          //   for (const key in data.errors) {
          //     if (data.errors[key]) {
          //       modalStateErrors.push(data.errors[key]);
          //     }
          //   }
          //   throw modalStateErrors.flat();
          // } else {
          //   toast.error(data);
          // }
          toast.error("Invalid Request");
          break;
        case 401:
          if (headerContent.includes('Bearer error="invalid_token"')) {
            window.localStorage.removeItem("jwt");
            // window.localStorage.removeItem("refreshToken");
            // window.localStorage.removeItem("mToken");
            window.localStorage.removeItem("user");
            // window.localStorage.removeItem("profileStatus");
            router.navigate("/");
            toast.info("Your session has expired, please login again");
          } else toast.error("unauthorised");
          break;
        case 403:
          toast.error("forbidden");
          break;
        case 404:
          router.navigate("/not-found");
          break;
        case 500:
          // store.commonStore.setServerError(data);
          toast.error("Service Downtime");
          // router.navigate("/server-error");
          break;
      }
      return Promise.reject(error);
    } catch (error) {
      console.log(`${error}`);
      if (navigator.onLine === false)
        toast.warning("Please check your internet connection");
      else toast.error("Service Downtime");
    }
  }
);

const requests = {
  get: <T>(url: string) => axios.get<T>(url).then(responseBody),
  post: <T>(url: string, body: {}) =>
    axios.post<T>(url, body).then(responseBody),
  put: <T>(url: string, body: {}) => axios.put<T>(url, body).then(responseBody),
  del: <T>(url: string) => axios.delete<T>(url).then(responseBody),
};



const Account = {
  current: () => requests.get<any>("account"),
  login: (user: any) =>
    requests.get<any>(
      `/Vendor/login?email=${user.email}&password=${user.password}`
    ),
  register: (user: any) =>
    requests.post<any>("/Vendor/register", user),
  updateAccountInfo: (user: any) =>
    requests.put<any>(
      "/Vendor/updateVendorAccountInformation",
      user
    ),
  forgotPassword: (user: string) =>
    requests.post<any>(
      `/Vendor/forgotpasswordforvendor?email=${user}`,
      {}
    ),
  refreshToken: (payload: any) =>
    requests.post<any>(`/Vendor/refreshtokenforvendor`, payload),
  verifyPasswordOtp: (data: any) =>
    requests.post<any>("/OTP/validateuserotp", data),
  changePassword: (user: any) =>
    requests.post<any>("/Vendor/resetpasswordforvendor", user),
  verifyEmail: (user: string) =>
    requests.post<any>(`/Vendor/verifyvendor?Email=${user}`, {}),
  getEligibility: (values: any) =>
    requests.post<any>("/Vendor/vendoreligibilitystatus", values),
  getAccountInfo: () =>
    requests.get<any>("/Vendor/getvendoraccountinformation"),
  getCategories: () =>
    requests.get<any>(`/Category/getAllCategories`),
  getStateCodes: () => requests.get<any>(`/Imal/getstatecodes`),
};


const Product = {
  getCategories: () =>
    requests.get<any>("/Category/getallcategories"),
  getBrands: () =>
    requests.get<any>(`/ProductBrand/getallproductbrands`),
  getBrandsWithPagination: (params: any) =>
    requests.get<any>(
      `/ProductBrand/getallproductbrands?PageNumber=${params.pageNumber}&PageSize=${params.pageSize}`
    ),
  addProduct: (payload: any) =>
    requests.post<any>(`/Product/createProduct`, payload),
  addMultipleProducts: (payload: any[]) =>
    requests.post<any>(`/Product/CreateMultipleProducts`, payload),
  updateProduct: (payload: any) =>
    requests.post<any>(`/Product/updateProduct`, payload),
  removeProduct: (payload: string) =>
    requests.put<any>(
      `/Product/RemoveProduct?productId=${payload}`,
      {}
    ),
  getVendorProducts: () =>
    requests.get<any>(`/Product/getAllVendorProducts`),
  getProduct: (id: string) =>
    requests.get<any>(`/Product/getVendorProduct?productId=${id}`),
};



const agent = {
  Account,
  Product,
};

export default agent;
