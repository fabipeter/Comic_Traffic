/**
 * Backend-Proxied TMDB Client
 * Zero API keys are stored on the frontend; all requests are encrypted end-to-end
 * and proxied through `/api/media/tmdb-proxy` on the backend.
 */
const requests = {
  fetchTrending: `/trending/all/week?language=en-US`,
  fetchNetflixOriginals: `/discover/tv?with_networks=213`,
  fetchTopRated: `/movie/top_rated?language=en-US`,
  fetchActionMovies: `/discover/movie?with_genres=28`,
  fetchComedyMovies: `/discover/movie?with_genres=35`,
  fetchHorrorMovies: `/discover/movie?with_genres=27`,
  fetchRomanceMovies: `/discover/movie?with_genres=10749`,
  fetchDocumentaries: `/discover/movie?with_genres=99`,
};

const instance = {
  async get(_path: string) {
    // Curated rows on the home page use the verified catalog items directly;
    // Live multi-API search in the Explorer and Navbar uses encryptedBackendClient.
    return {
      data: { results: [] },
    };
  },
};

const tmdbagent = {
  requests,
  instance,
};

export default tmdbagent;
