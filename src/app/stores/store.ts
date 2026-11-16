import { createContext, useContext } from "react";
import CommonStore from "./commonStore";
import RatingStore from "./ratingStore";
import UserStore from "./userStore";

interface Store {
  commonStore: CommonStore;
  userStore: UserStore;
  ratingStore: RatingStore;
}

export const store: Store = {
  commonStore: new CommonStore(),
  userStore: new UserStore(),
  ratingStore: new RatingStore(),
};

export const StoreContext = createContext(store);

export function useStore() {
  return useContext(StoreContext);
}
