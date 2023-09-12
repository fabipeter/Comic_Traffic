import styles from "./styles.module.css";
import profile from "../../../assets/image/companyName.png";
import { Dispatch, useState } from "react";
import logo from "../../../assets/altlogo.svg";
import { SetStateAction } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ReactComponent as HamburgerSvg } from "../../../assets/navbericon/hamburger.svg";
import { ReactComponent as NotificationSvg } from "../../../assets/navbericon/notification1.svg";
import { ReactComponent as ProfileSvg } from "../../../assets/navbericon/profile.svg";
import { ReactComponent as ProfileLineSvg } from "../../../assets/navbericon/profileLine.svg";
import { ReactComponent as ProfileArrowSvg } from "../../../assets/navbericon/icon/more.svg";
import { ReactComponent as LogOutSvg } from "../../../assets/navbericon/icon/logout.svg";
import { ReactComponent as Logo } from "../../../assets/budgetXploraLogo.svg";
import { ReactComponent as SvgSearchIcon } from "../../../assets/navbericon/mobileSearch.svg";
import { ReactComponent as SearchIconWBorder } from "../../../assets/navbericon/searchIcon.svg";
import { useStore } from "../../../app/stores/store";
import { UserProfile } from "../../../app/models/user";
import useMediaQuery from "../../../app/common/hooks/useMediaQuery";

interface HeaderProps {
  user?: UserProfile;
  setOpen?: Dispatch<SetStateAction<boolean>>;
}

const Header = ({ user, setOpen = () => {} }: HeaderProps) => {
  const navigate = useNavigate();

  const matches = useMediaQuery("(min-width: 800px)");

  const [profileModal, setProfileModal] = useState(false);

  const [searchActive, setSearchActive] = useState(false);
  const { userStore } = useStore();
  const { logout } = userStore;

  return (
    <>
      <div className={styles.headerContainer}>
        {!matches ? (
          <>
            {/* <img src={logo} alt="" /> */}
            <Logo onClick={() => navigate("/")} />
            <div className={styles.flexHeaderSm}>
              {searchActive ? (
                <div className={styles.searchBarSm}>
                  <input placeholder="Enter Keyword" />
                  <SvgSearchIcon className={styles.searchIcon} />
                </div>
              ) : (
                <button onClick={() => setSearchActive(true)}>
                  <SearchIconWBorder width={48} />
                </button>
              )}
              <button
                style={{ marginLeft: "7px" }}
                onClick={() => setOpen((state) => !state)}
              >
                <HamburgerSvg />
              </button>
            </div>
          </>
        ) : (
          <div className={`${styles.flexHeader}`}>
            {/* <div className={`${styles.searchBar}`}>
              <input placeholder="Enter Keyword" />

              <div className={styles.searchIcon}>
                <SearchIcon />
              </div>
            </div> */}
            <NavLink
              to={`/vendor/dashboard`}
              style={{ marginRight: "50px" }}
            >
              {({ isActive }) => (
                <NotificationSvg
                  style={{ stroke: !isActive ? "#344437" : "#36b44a" }}
                />
              )}
            </NavLink>
            <ProfileSvg style={{ marginRight: "15px" }} />
            <h3 style={{ margin: "0px" }}>
              {user!.firstName} {user!.lastName}
            </h3>
            <ProfileArrowSvg
              style={{ marginRight: "20px", marginLeft: "20px" }}
              onClick={() => setProfileModal((state) => !state)}
            />
            {/* <img
              src={profile}
              onClick={() => setProfileModal((state) => !state)}
              alt="profilelogo"
            /> */}
            <ProfileLineSvg
              style={{ marginRight: "30px" }}
              onClick={() => setProfileModal((state) => !state)}
            />

            <h3
              style={{
                margin: "0px",
                marginLeft: "10px",
                marginRight: "10px",
                fontWeight: "400",
              }}
            >
              Log Out
            </h3>
            <LogOutSvg
              style={{ marginRight: "20px", cursor: "pointer" }}
              onClick={() => logout()}
            />
          </div>
        )}
        <ProfileModal user={user} open={profileModal} />
      </div>
    </>
  );
};

const ProfileModal = ({ user, open }: { user: any; open: boolean }) => {
  const navigate = useNavigate();

  const { userStore } = useStore();
  const { logout } = userStore;

  return (
    <>
      {open && (
        <div className={styles.modalContainer}>
          {/* <div className={styles.profileContainer}>
            <img src={profile} />
            <div className={styles.profileText}>
              <h3>{user.vendorProfileDto.companyName}</h3>
              <p>{user.vendorProfileDto.email}</p>
            </div>
          </div> */}
          <div className="divider" />
          <div className={styles.profileLinksContainer}>
            <button onClick={() => navigate("/vendor/settings")}>
              View Profile
            </button>
            <button onClick={() => navigate("/vendororders")}>
              View Orders
            </button>
            <button>Track Order</button>
            <button>Support</button>
          </div>
          <div className="divider" />
          <div className={styles.logoutContainer}>
            <button onClick={logout}>logout</button>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
