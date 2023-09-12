import { useState, useEffect } from "react";
import "./Nav.css";
import { useNavigate } from "react-router-dom";
import DarkMode from "../general/Theme/DarkMode";
const Nav = () => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const transitionNavBar = () => {
    if (window.scrollY > 20) {
      setShow(true);
    } else setShow(false);
  };

  useEffect(() => {
    window.addEventListener("scroll", transitionNavBar);

    return () => {
      window.removeEventListener("scroll", transitionNavBar);
    };
  }, []);

  return (
    <div className={`nav ${show && "nav__black"}`}>
      <div className="nav__contents">
        <img
          className="nav__logo"
          src={process.env.REACT_APP_COMICTRAFFIC_LOGO}         
           alt=""
          onClick={() => navigate("")}
        />
        {/* <img
          className="nav__avatar"
          src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png?20201013161117"
          alt=""
          onClick={() => navigate("/")}
        /> */}
        <div className="nav__right">
        <DarkMode />
        <button
          className="nav__signin__button"
          // onClick={() => setSignIn(true)}
        >
          Sign In
        </button>
        </div>
      </div>
    </div>
  );
};

export default Nav;
