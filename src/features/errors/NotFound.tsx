import React, { useState, useEffect } from "react";
// import "./Nav.css";
// import "./Banner.css";
import "./NotFound.css";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const transitionNavBar = () => {
    if (window.scrollY > 100) {
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
    <div className="notfoundpage">
      {" "}
      {/* <div className={`nav ${show && "nav__black"}`}>
        <div className="nav__contents">
          <img
            className="nav__logo"
            //   src="https://assets.stickpng.com/images/580b57fcd9996e24bc43c529.png"
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/1597px-Netflix_2015_logo.svg.png?20190206123158"
            alt=""
            onClick={() => navigate("/")}
          />
        </div>
      </div> */}
      <header
        className="notfoundpage__banner"
        style={{
          backgroundSize: "cover",
          backgroundImage: `url(${process.env.REACT_APP_NETFLIX_NOTFOUND_BANNER})`,
          backgroundPosition: "center center",
        }}
      >
        <div className="notfound__contents">
          <h1>Lost your way?</h1>

          <div className="error-page--content--body">
            <p>
              Sorry, we can't find that page. You'll find lots to explore on the
              home page.{" "}
            </p>
            <div className="error-page--content--buttons">
              <a href="/" tabIndex={-1}>
                <button
                  className="color-primary hasLabel ltr-18ezbm2"
                  type="button"
                >
                  <span className="ltr-1vh9doa">Comic Traffic Home</span>
                </button>
              </a>
            </div>
            <div className="error-page--content--errorCode">
              <span id="" data-uia="">
                Error Code <strong>NSES-404</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="banner--fadeBottom" />
      </header>
    </div>
  );
};

export default NotFound;
