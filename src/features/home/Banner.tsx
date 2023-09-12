import React, { useState, useEffect } from "react";
import "./Banner.css";
import tmdbagent from "../../app/api/tmdbagent";
const Banner = () => {
  const [movie, setMovie] = useState<any>({});

  useEffect(() => {
    const fetchData = async () => {
      const request = await tmdbagent.instance.get(
        tmdbagent.requests.fetchNetflixOriginals
      );
      // console.log(request.data.results[0])
      setMovie(
        request.data.results[
          Math.floor(Math.random() * request.data.results.length - 1)
        ]
      );
      return request;
    };

    fetchData();
  }, []);

  const truncate = (desc: string, n: number) => {
    return desc?.length > n ? desc.substring(0, n - 1) + "..." : desc;
  };
  return (
    <header
      className="banner"
      style={{
        backgroundSize: "cover",
        backgroundImage:
          movie && movie.backdrop_path
            ? `url('${process.env.REACT_APP_TMDB_MOVIE_BANNER_BASE_URL}${movie?.backdrop_path}')`
            : "#000",
        backgroundPosition: "center center",
      }}
    >
      <div className="banner__contents">
        <div>
          <h1
            data-uia="nmhp-card-hero-text-title"
            className="default-ltr-cache-19f4kxn ejqbulh8"
          >
            Movies, Tv Shows and more.
          </h1>
          <p
            data-uia="nmhp-card-hero-text-subtitle"
            className="default-ltr-cache-1ndpmgo ejqbulh7"
          >
            View Movies and Tv series details and their cumulative ratings.
          </p>
          <div className="default-ltr-cache-1asgq30 ejqbulh4">
            <div className="default-ltr-cache-inkrn e1w590cc2">
              <form
                data-uia="email-form"
                className=" default-ltr-cache-1u8qly9"
                aria-label="Sign up or restart your membership with Netflix."
              >
                <h3 className="default-ltr-cache-btlj1u e1w590cc1">
                  {/* Discover movies, tv shows and much more */}
                </h3>
                <div
                  data-issplitform="false"
                  data-hasmessage="false"
                  className="default-ltr-cache-1jbflut e1w590cc0"
                >
                  <div
                    data-uia="field-email+container"
                    className=" e1skmawq1 default-ltr-cache-17kww2f ea3diy34"
                  >
                    <label
                      htmlFor="63616ea9d28fd"
                      data-uia="field-email+label"
                      className="default-ltr-cache-hyhv56 ea3diy31"
                    >
                      Search movies or series
                    </label>
                    <div className="default-ltr-cache-dk343m ea3diy33">
                      <input
                        autoComplete=""
                        minLength={5}
                        maxLength={50}
                        type="text"
                        id="63616ea9d28fd"
                        name="searchword"
                        // data-uia="field-email"
                        // value=""
                        placeholder="Search..."
                        // onChange={(e) =>
                        //   setLoginDetails({
                        //     ...loginDetails,
                        //     email: e.target.value,
                        //   })
                        // }
                      />
                    </div>
                  </div>
                  <button
                    className=" e1ax5wel1 default-ltr-cache-f1k880"
                    data-uia="nmhp-card-cta+hero_fuji"
                    type="button"
                    // onClick={() => setSignIn(true)}
                  >
                    Search
                    {/* <div
                      aria-hidden="true"
                      className="default-ltr-cache-17uj5h e1ax5wel0"
                    >
                      <span
                        dir="ltr"
                        className="default-ltr-cache-l3xpob e1boxt2d0"
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          data-mirrorinrtl="true"
                          className="default-ltr-cache-0 e1mhci4z1"
                          data-name="ChevronRight"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M15.5859 12L8.29303 19.2928L9.70725 20.7071L17.7072 12.7071C17.8948 12.5195 18.0001 12.2652 18.0001 12C18.0001 11.7347 17.8948 11.4804 17.7072 11.2928L9.70724 3.29285L8.29303 4.70706L15.5859 12Z"
                            fill="currentColor"
                          ></path>
                        </svg>
                      </span>
                    </div> */}
                  </button>
                </div>
              </form>
            </div>
            <div className="center-pixel default-ltr-cache-1qms9jn ekwtkbw0"></div>
          </div>
        </div>
      </div>
      <div className="banner--fadeBottom" />
    </header>
  );
};

export default Banner;
