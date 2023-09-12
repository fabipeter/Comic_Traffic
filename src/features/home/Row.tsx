import React, { useState, useEffect } from "react";
import "./Row.css";
import tmdbagent from "../../app/api/tmdbagent";
import { observer } from "mobx-react-lite";

const Row = (props:any) => {
  const { title, fetchUrl, isLargeRow } = props;
  const [movies, setMovies] = useState<any[]>([]);
  useEffect(() => {
    const fetchData = async () => {
      const request = await tmdbagent.instance.get(fetchUrl);
      setMovies(request.data.results);
      return request;
    };
    fetchData();
  }, [fetchUrl]);

  return (
    <div className="row">
      <h2 className="row__title">{title}</h2>

      <div className="row__posters">
        {movies?.map(
          (movie, index) =>
            ((isLargeRow && movie.poster_path) ||
              (!isLargeRow && movie.backdrop_path)) && (
              <img
                className={`row__poster ${isLargeRow && "row__posterLarge"}`}
                src={
                  movie && (movie.backdrop_path || movie.poster_path)
                    ? `${process.env.REACT_APP_TMDB_MOVIE_BANNER_BASE_URL}${
                        isLargeRow ? movie.poster_path : movie.backdrop_path
                      }`
                    : `${isLargeRow ? movie.poster_path : movie.backdrop_path}`
                }
                key={index}
                alt={movie.name}
              />
            )
        )}
      </div>
    </div>
  );
};

export default observer(Row);
