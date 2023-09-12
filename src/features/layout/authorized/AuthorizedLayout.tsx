import React, { ReactNode, useEffect, useState } from "react";
import Header from "./Header";
// import SideBar from "./SideBar";
import styles from "./styles.module.css";
import { useStore } from "../../../app/stores/store";
import { useNavigate } from "react-router-dom";
import Loading from "../../general/Loading";

interface Props {
  children: ReactNode;
}

const AuthorizedLayout = ({ children }: Props) => {
  const [sideBarOpen, setSideBarOpen] = useState(false);
  const navigate = useNavigate();
  const { commonStore } = useStore();
  const { loggedInUser, token } = commonStore;
  useEffect(() => {
    if (!token) {
      navigate("/login");
    }
  }, [navigate, token]);
  if (!token) return <Loading />;
  return (
    <div className={styles.flex}>
      {/* <SideBar open={sideBarOpen} setOpen={setSideBarOpen} /> */}
      <div className={styles.relative}>
        <Header setOpen={setSideBarOpen} user={loggedInUser!} />
        <div className={styles.page}>{children}</div>
      </div>
    </div>
  );
};

export default AuthorizedLayout;
