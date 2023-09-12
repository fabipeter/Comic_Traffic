import axios from "axios";

const instance = axios.create({
  baseURL: process.env.REACT_APP_TMDB_API_URL,
});



const API_KEY = process.env.REACT_APP_TMDB_API_KEY;

const requests = {
  fetchTrending: `/trending/all/week?api_key=${API_KEY}&language=en-US`,
  fetchNetflixOriginals: `/discover/tv?api_key=${API_KEY}&with_networks=213`,
  fetchTopRated: `/movie/top_rated?api_key=${API_KEY}&language=en-US`,
  fetchActionMovies: `/discover/movie?api_key=${API_KEY}&with_genres=28`,
  fetchComedyMovies: `/discover/movie?api_key=${API_KEY}&with_genres=35`,
  fetchHorrorMovies: `/discover/movie?api_key=${API_KEY}&with_genres=27`,
  fetchRomanceMovies: `/discover/movie?api_key=${API_KEY}&with_genres=10749`,
  fetchDocumentaries: `/discover/movie?api_key=${API_KEY}&with_genres=99`,
};

// const results = [
//   {
//       "backdrop_path": "/qD211Hb5XwFxrszzBBe5EUYJerh.jpg",
//       "first_air_date": "2023-08-31",
//       "genre_ids": [
//           10759,
//           10765
//       ],
//       "id": 111110,
//       "name": "ONE PIECE",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "ONE PIECE",
//       "overview": "With his straw hat and ragtag crew, young pirate Monkey D. Luffy goes on an epic voyage for treasure in this live-action adaptation of the popular manga.",
//       "popularity": 1822.957,
//       "poster_path": "/rVX05xRKS5JhEYQFObCi4lAnZT4.jpg",
//       "vote_average": 8.3,
//       "vote_count": 292
//   },
//   {
//       "backdrop_path": "/wbiPjTWpZMIB8ffBq7HvzAph4Ft.jpg",
//       "first_air_date": "2016-01-25",
//       "genre_ids": [
//           80,
//           10765
//       ],
//       "id": 63174,
//       "name": "Lucifer",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Lucifer",
//       "overview": "Bored and unhappy as the Lord of Hell, Lucifer Morningstar abandoned his throne and retired to Los Angeles, where he has teamed up with LAPD detective Chloe Decker to take down criminals. But the longer he's away from the underworld, the greater the threat that the worst of humanity could escape.",
//       "popularity": 538.348,
//       "poster_path": "/ekZobS8isE6mA53RAiGDG93hBxL.jpg",
//       "vote_average": 8.5,
//       "vote_count": 13806
//   },
//   {
//       "backdrop_path": "/zCTLW4s4Cm2DfBfaIDBB1XDzqsU.jpg",
//       "first_air_date": "2015-12-24",
//       "genre_ids": [
//           16,
//           10751,
//           10762,
//           35,
//           10759
//       ],
//       "id": 64783,
//       "name": "Dawn of the Croods",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Dawn of the Croods",
//       "overview": "The world's first family is back for more laughs as they discover sports, sleepovers and other wonders in a world of exotic creatures and adventures. This 2D animated cartoon is based on the 3D animated feature film, \"The Croods\".",
//       "popularity": 517.198,
//       "poster_path": "/cyCAsMLGECvEAFDfKcxcWy7YTOW.jpg",
//       "vote_average": 7.6,
//       "vote_count": 84
//   },
//   {
//       "backdrop_path": "/c4CSgKL6QfkJxsWcGYDyTxpbzpW.jpg",
//       "first_air_date": "2017-03-31",
//       "genre_ids": [
//           18,
//           9648
//       ],
//       "id": 66788,
//       "name": "13 Reasons Why",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "13 Reasons Why",
//       "overview": "After a teenage girl's perplexing suicide, a classmate receives a series of tapes that unravel the mystery of her tragic choice.",
//       "popularity": 450.711,
//       "poster_path": "/nel144y4dIOdFFid6twN5mAX9Yd.jpg",
//       "vote_average": 7.7,
//       "vote_count": 3800
//   },
//   {
//       "backdrop_path": "/3Aj7j0xHXwGntChU1VaL9seBGIe.jpg",
//       "first_air_date": "2021-09-30",
//       "genre_ids": [
//           16,
//           10759
//       ],
//       "id": 129600,
//       "name": "Baki Hanma",
//       "origin_country": [
//           "JP"
//       ],
//       "original_language": "ja",
//       "original_name": "範馬刃牙",
//       "overview": "To gain the skills he needs to surpass his powerful father, Baki enters Arizona State Prison to take on the notorious inmate known as Mr. Unchained.",
//       "popularity": 403.991,
//       "poster_path": "/x145FSI9xJ6UbkxfabUsY2SFbu3.jpg",
//       "vote_average": 8.2,
//       "vote_count": 404
//   },
//   {
//       "backdrop_path": "/vyhmiHVWUvmH6jrfvtPdcwYc2I8.jpg",
//       "first_air_date": "2015-06-26",
//       "genre_ids": [
//           10751,
//           10762,
//           16,
//           10759,
//           10765
//       ],
//       "id": 78173,
//       "name": "Dragons: Race to the Edge",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Dragons: Race to the Edge",
//       "overview": "Unlock the secrets of the Dragon Eye and come face to face with more dragons than anyone has ever imagined as Hiccup, Toothless and the Dragon Riders soar to the edge of adventure.",
//       "popularity": 364.38,
//       "poster_path": "/8p0raLxaxLeK4g19eXk39RfUrb7.jpg",
//       "vote_average": 8.3,
//       "vote_count": 273
//   },
//   {
//       "backdrop_path": "/foGkPxpw9h8zln81j63mix5B7m8.jpg",
//       "first_air_date": "2019-12-20",
//       "genre_ids": [
//           18,
//           10759,
//           10765
//       ],
//       "id": 71912,
//       "name": "The Witcher",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "The Witcher",
//       "overview": "Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny in a turbulent world where people often prove more wicked than beasts.",
//       "popularity": 364.237,
//       "poster_path": "/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg",
//       "vote_average": 8.1,
//       "vote_count": 5098
//   },
//   {
//       "backdrop_path": "/uGL51pEZZPaxickbjWjsQaXDXWq.jpg",
//       "first_air_date": "2018-05-23",
//       "genre_ids": [
//           99
//       ],
//       "id": 79746,
//       "name": "Explained",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Explained",
//       "overview": "This documentary series, made in partnership with Vox, explain some of the world's current trends, from politics, to science to pop culture.",
//       "popularity": 355.624,
//       "poster_path": "/4iiV2Fh4EA5of5B9Wtgllu0WDWA.jpg",
//       "vote_average": 7.6,
//       "vote_count": 89
//   },
//   {
//       "backdrop_path": "/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
//       "first_air_date": "2022-11-23",
//       "genre_ids": [
//           10765,
//           9648,
//           35
//       ],
//       "id": 119051,
//       "name": "Wednesday",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Wednesday",
//       "overview": "Wednesday Addams is sent to Nevermore Academy, a bizarre boarding school where she attempts to master her psychic powers, stop a monstrous killing spree of the town citizens, and solve the supernatural mystery that affected her family 25 years ago — all while navigating her new relationships.",
//       "popularity": 319.546,
//       "poster_path": "/9PFonBhy4cQy7Jz20NpMygczOkv.jpg",
//       "vote_average": 8.6,
//       "vote_count": 7437
//   },
//   {
//       "backdrop_path": "/m6eRgkR1KC6Mr6gKx6gKCzSn6vD.jpg",
//       "first_air_date": "2008-10-03",
//       "genre_ids": [
//           10759,
//           16,
//           10765
//       ],
//       "id": 4194,
//       "name": "Star Wars: The Clone Wars",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Star Wars: The Clone Wars",
//       "overview": "Yoda, Obi-Wan Kenobi, Anakin Skywalker, Mace Windu and other Jedi Knights lead the Grand Army of the Republic against the droid army of the Separatists.",
//       "popularity": 316.621,
//       "poster_path": "/e1nWfnnCVqxS2LeTO3dwGyAsG2V.jpg",
//       "vote_average": 8.5,
//       "vote_count": 1741
//   },
//   {
//       "backdrop_path": "/2MaumbgBlW1NoPo3ZJO38A6v7OS.jpg",
//       "first_air_date": "2016-07-15",
//       "genre_ids": [
//           18,
//           10765,
//           9648
//       ],
//       "id": 66732,
//       "name": "Stranger Things",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Stranger Things",
//       "overview": "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.",
//       "popularity": 295.662,
//       "poster_path": "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
//       "vote_average": 8.6,
//       "vote_count": 16054
//   },
//   {
//       "backdrop_path": "/gs8Mu6iK3w4HeBIaF0eHewxpQWz.jpg",
//       "first_air_date": "2023-08-24",
//       "genre_ids": [
//           10759,
//           80
//       ],
//       "id": 227318,
//       "name": "Who Is Erin Carter?",
//       "origin_country": [
//           "GB"
//       ],
//       "original_language": "en",
//       "original_name": "Who Is Erin Carter?",
//       "overview": "A British woman's tranquil life in Barcelona spirals out of control when an armed robbery at a supermarket exposes her secret... and violent past.",
//       "popularity": 277.485,
//       "poster_path": "/1FCsjYtEtuine1TUssIFjy6vmJW.jpg",
//       "vote_average": 7.5,
//       "vote_count": 58
//   },
//   {
//       "backdrop_path": "/BA1cBwYLMQFfReDaXQZ5KmPpFf.jpg",
//       "first_air_date": "2018-04-14",
//       "genre_ids": [
//           16,
//           35,
//           10762
//       ],
//       "id": 125004,
//       "name": "Littlest Pet Shop: A World of Our Own",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Littlest Pet Shop: A World of Our Own",
//       "overview": "In Paw-Tucket, pets of all types form friendships, pursue their passions and have a great time being themselves.",
//       "popularity": 274.427,
//       "poster_path": "/dhksSgkzyNyqlcaUFuGRcJZZqrV.jpg",
//       "vote_average": 4.6,
//       "vote_count": 7
//   },
//   {
//       "backdrop_path": "/qbxoEhlxNcyr7GjG2SXTShWn32m.jpg",
//       "first_air_date": "2018-06-26",
//       "genre_ids": [
//           16,
//           10759,
//           80,
//           18
//       ],
//       "id": 80623,
//       "name": "BAKI",
//       "origin_country": [
//           "JP"
//       ],
//       "original_language": "ja",
//       "original_name": "バキ",
//       "overview": "While martial arts champion Baki Hanma trains hard to surpass his legendary father, five violent death row inmates descend upon Tokyo to take him on.",
//       "popularity": 263.099,
//       "poster_path": "/j4bL0G8h8k49MuXKYfZqhXqk2rI.jpg",
//       "vote_average": 8.1,
//       "vote_count": 1149
//   },
//   {
//       "backdrop_path": "/cCR0IyIs3F2OlRb56z1RfwEOEhF.jpg",
//       "first_air_date": "2023-02-09",
//       "genre_ids": [
//           10759,
//           35,
//           16,
//           10751
//       ],
//       "id": 157221,
//       "name": "My Dad the Bounty Hunter",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "My Dad the Bounty Hunter",
//       "overview": "An intergalactic bounty hunter takes dad duty to new extremes when his two kids accidentally hitch a ride with him to outer space and crash his mission.",
//       "popularity": 258.068,
//       "poster_path": "/cWSPHOTFFf5hs77gamKeLDhxNvm.jpg",
//       "vote_average": 8.2,
//       "vote_count": 26
//   },
//   {
//       "backdrop_path": "/AmIHaw6CQWOfBCQYom15Jzsu7OB.jpg",
//       "first_air_date": "2014-08-22",
//       "genre_ids": [
//           16,
//           35,
//           18
//       ],
//       "id": 61222,
//       "name": "BoJack Horseman",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "BoJack Horseman",
//       "overview": "Meet the most beloved sitcom horse of the 90s - 20 years later. BoJack Horseman was the star of the hit TV show \"Horsin' Around,\" but today he's washed up, living in Hollywood, complaining about everything, and wearing colorful sweaters.",
//       "popularity": 244.66,
//       "poster_path": "/6JFWzlChcGgLiIUo2COgNlWGFKy.jpg",
//       "vote_average": 8.6,
//       "vote_count": 2057
//   },
//   {
//       "backdrop_path": "/eOLKWXXbcZJg91Jf1Fn7odUirl3.jpg",
//       "first_air_date": "2021-07-23",
//       "genre_ids": [
//           10759,
//           10765,
//           16
//       ],
//       "id": 96658,
//       "name": "Masters of the Universe: Revelation",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Masters of the Universe: Revelation",
//       "overview": "The war for Eternia begins again in what may be the final battle between He-Man and Skeletor. A new animated series from writer-director Kevin Smith.",
//       "popularity": 238.683,
//       "poster_path": "/vIhyANmvTiBjlmX0Uy48Z9AD24j.jpg",
//       "vote_average": 6.5,
//       "vote_count": 314
//   },
//   {
//       "backdrop_path": "/yUDJ1r0UQdhb904povev5apjTVh.jpg",
//       "first_air_date": "2016-10-17",
//       "genre_ids": [
//           18,
//           10765
//       ],
//       "id": 67683,
//       "name": "Travelers",
//       "origin_country": [
//           "CA"
//       ],
//       "original_language": "en",
//       "original_name": "Travelers",
//       "overview": "Hundreds of years from now, the last surviving humans discover the means of sending consciousness back through time, directly into people in the 21st century. These \"travelers\" assume the lives of seemingly random people, while secretly working as teams to perform missions in order to save humanity from a terrible future.",
//       "popularity": 236.443,
//       "poster_path": "/aUVeyeyTrQrSFuUkqLCT8FtV7pp.jpg",
//       "vote_average": 7.6,
//       "vote_count": 611
//   },
//   {
//       "backdrop_path": "/dVTyx2n13PvEG44iH40DdaNym2A.jpg",
//       "first_air_date": "2021-02-17",
//       "genre_ids": [
//           99,
//           10763,
//           10768
//       ],
//       "id": 118043,
//       "name": "Amend: The Fight for America",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "Amend: The Fight for America",
//       "overview": "When the United States of America was founded, the ideals of freedom and equality did not apply to all people. These are the stories of the brave Americans who fought to right the nation’s wrongs and enshrine the values we hold most dear into the Constitution — with liberty and justice for all.",
//       "popularity": 236.346,
//       "poster_path": "/a7i3jJe9rI7RSvlGoMB7aYI7XVt.jpg",
//       "vote_average": 7.1,
//       "vote_count": 158
//   },
//   {
//       "backdrop_path": "/jBFOVEE5sMIyT141YIqIwyU8Y1D.jpg",
//       "first_air_date": "2022-05-13",
//       "genre_ids": [
//           18,
//           80
//       ],
//       "id": 116799,
//       "name": "The Lincoln Lawyer",
//       "origin_country": [
//           "US"
//       ],
//       "original_language": "en",
//       "original_name": "The Lincoln Lawyer",
//       "overview": "Sidelined after an accident, hotshot Los Angeles lawyer Mickey Haller restarts his career - and his trademark Lincoln - when he takes on a murder case.",
//       "popularity": 229.222,
//       "poster_path": "/9TaupczRcEkOaYbsiQuLg3kXPLq.jpg",
//       "vote_average": 7.8,
//       "vote_count": 177
//   }
// ]

const tmdbagent = {
  requests,
  instance,
};

export default tmdbagent;
