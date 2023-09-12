import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { ISearchValues, SearchValues } from "../../app/models/search";
import { useStore } from "../../app/stores/store";
import { useNavigate } from "react-router-dom";
import useMediaQuery from "../../app/common/hooks/useMediaQuery";
import Nav from "./Nav";
import Banner from "./Banner";
import Row from "./Row";
import tmdbagent from "../../app/api/tmdbagent";

const LandingPage = () => {
  const matches = useMediaQuery("(min-width: 800px)");
  const navigate = useNavigate();
  const { commonStore } = useStore();
  const { token } = commonStore;
  const [inputField, setInputField] = useState<ISearchValues>(
    new SearchValues()
  );

  return (
    <div className="homeScreen">
      {/* Navbar */}
      <Nav />
      <Banner />
     
      <Row title="Trending Now" fetchUrl={tmdbagent.requests.fetchTrending} isLargeRow/>
      <Row title="Top Rated" fetchUrl={tmdbagent.requests.fetchTopRated} />
      <Row title="Netflix Originals" fetchUrl={tmdbagent.requests.fetchNetflixOriginals}/>
      <Row title="Action Movies " fetchUrl={tmdbagent.requests.fetchActionMovies} />
      <Row title="Comedy Movies" fetchUrl={tmdbagent.requests.fetchComedyMovies} />
      <Row title="Horror Movies" fetchUrl={tmdbagent.requests.fetchHorrorMovies} />
      <Row title="Romance Movies" fetchUrl={tmdbagent.requests.fetchRomanceMovies} />
      <Row title="Documentaries" fetchUrl={tmdbagent.requests.fetchDocumentaries} />
    </div>
  );
};

export default observer(LandingPage);
