import React from "react";
import "./NotFound.css";
import { useNavigate } from "react-router-dom";
import Nav from "../home/Nav";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="notfoundpage">
      <Nav />
      <header className="notfoundpage__banner">
        <div className="notfound__contents">
          <div className="adx-404-badge">⚡ ERROR 404</div>
          <h1>B-Baka! You came to the wrong place!</h1>
          <div className="error-page--content--body">
            <p>
              This timeline or comic issue doesn't exist in the Comic Traffic Index.
              Return to the main hub to explore top-rated comics, movies, and
              series.
            </p>
            <div className="error-page--content--buttons">
              <button
                className="ct-primary-cta-btn"
                type="button"
                onClick={() => navigate("/")}
              >
                🔥 Return to Comic Traffic Home
              </button>
            </div>
            <div className="error-page--content--errorCode">
              <span>
                Error Code <strong>CT-404</strong>
              </span>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};

export default NotFound;
