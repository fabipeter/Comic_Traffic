import React from "react";
import { Link } from "react-router-dom";
import Nav from "../home/Nav";
import "./LegalPages.css";

const EFFECTIVE_DATE = "November 23, 2026";
const CONTACT_EMAIL = "contact@comictraffic.com";
const DMCA_EMAIL = "dmca@comictraffic.com";

/**
 * Compact TMDB attribution mark sized smaller than Comic Traffic's own brand logo
 * in compliance with TMDB API Attribution Guidelines.
 */
export const TmdbAttributionMark: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => (
  <a
    href="https://www.themoviedb.org/"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="The Movie Database (TMDB)"
    className="ct-tmdb-mark-link"
    style={{
      display: "inline-flex",
      alignItems: "center",
      textDecoration: "none",
      flexShrink: 0,
    }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 110 24"
      width={compact ? 84 : 102}
      height={compact ? 18 : 22}
      role="img"
      aria-label="TMDB"
    >
      <defs>
        <linearGradient id="tmdbBrandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#90cea1" />
          <stop offset="100%" stopColor="#01b4e4" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="109"
        height="23"
        rx="11.5"
        fill="#0d253f"
        stroke="url(#tmdbBrandGrad)"
        strokeWidth="1"
      />
      <text
        x="14"
        y="15.5"
        fill="url(#tmdbBrandGrad)"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="11"
        fontWeight="900"
        letterSpacing="1.2"
      >
        TMDB
      </text>
      <rect x="64" y="8" width="32" height="8" rx="4" fill="url(#tmdbBrandGrad)" />
    </svg>
  </a>
);

const LegalNavTabs: React.FC<{ active: "privacy" | "terms" | "attributions" }> = ({
  active,
}) => (
  <nav className="ct-legal-tabs" aria-label="Legal and compliance pages">
    <Link to="/" className="ct-legal-tab">
      ← Back to Home
    </Link>
    <Link
      to="/privacy"
      className={`ct-legal-tab ${active === "privacy" ? "active" : ""}`}
    >
      Privacy Policy
    </Link>
    <Link
      to="/terms"
      className={`ct-legal-tab ${active === "terms" ? "active" : ""}`}
    >
      Terms of Service
    </Link>
    <Link
      to="/legal/attributions"
      className={`ct-legal-tab ${active === "attributions" ? "active" : ""}`}
    >
      API Attributions &amp; DMCA
    </Link>
  </nav>
);

export const PrivacyPolicyPage: React.FC = () => (
  <div className="ct-legal-page">
    <Nav />
    <main className="ct-legal-container">
      <LegalNavTabs active="privacy" />
      <article className="ct-legal-card">
        <span className="ct-legal-badge">Non-Commercial Community Platform</span>
        <h1>Privacy Policy</h1>
        <p className="ct-legal-updated">
          Effective Date: {EFFECTIVE_DATE} • Website: https://comictraffic.com
        </p>

        <p>
          Comic Traffic is operated as a free, non-commercial community and
          portfolio platform for discovering, rating, and comparing Movies, TV
          Series, and Comic Books. We do not sell personal data, display
          behavioral advertising, or charge fees.
        </p>

        <section className="ct-legal-section">
          <h2>1. Information We Collect</h2>
          <ul>
            <li>
              <strong>Account Information:</strong> Username, display name, email
              address, salted/hashed password, optional profile bio, favorite
              genres, and timestamp of Terms/Privacy acceptance.
            </li>
            <li>
              <strong>Community &amp; Activity Data:</strong> Reviews, scores,
              spoiler flags, helpful votes, watchlists/reading lists, custom
              media collections, custom source weight settings, and moderation
              reports you choose to submit.
            </li>
            <li>
              <strong>Browser Local Storage:</strong> Strictly necessary
              functional storage (`jwt`, `user`, `ct_user_profile`, theme skin,
              lite mode, layout preference, and local review/watchlist cache) to
              keep you signed in and preserve your UI settings. We do not use
              third-party ad cookies or cross-site tracking pixels.
            </li>
            <li>
              <strong>Technical Logs:</strong> Standard HTTP request logs
              (IP address, user agent, timestamps) processed transiently by our
              hosting providers for rate limiting, abuse prevention, and
              diagnostics.
            </li>
          </ul>
        </section>

        <section className="ct-legal-section">
          <h2>2. How We Use Your Data</h2>
          <ul>
            <li>Authenticate your account and protect sessions.</li>
            <li>
              Send transactional account emails (welcome confirmation and
              password-reset verification codes). We do not send unsolicited
              marketing emails.
            </li>
            <li>
              Display public community reviews, ratings, and public lists you
              author, and compute community average ratings.
            </li>
            <li>
              Prevent spam, abuse, and security incidents, and process
              moderation or copyright takedown requests.
            </li>
          </ul>
        </section>

        <section className="ct-legal-section">
          <h2>3. Infrastructure &amp; Third-Party Subprocessors</h2>
          <p>
            To deliver the service, limited data passes through the following
            infrastructure providers:
          </p>
          <ul>
            <li>
              <strong>Vercel:</strong> Frontend static hosting and serverless
              API gateway.
            </li>
            <li>
              <strong>Railway &amp; PostgreSQL:</strong> Backend application
              hosting and relational database storage.
            </li>
            <li>
              <strong>SendGrid (Twilio):</strong> Transactional welcome and
              password-reset email delivery.
            </li>
            <li>
              <strong>External Media APIs:</strong> Search queries (not your
              personal account details) are forwarded server-side to public
              media metadata providers listed on our{" "}
              <Link to="/legal/attributions">API Attributions</Link> page. Your
              browser also loads poster/cover artwork directly from those
              providers&apos; image CDNs.
            </li>
          </ul>
        </section>

        <section className="ct-legal-section">
          <h2>4. Your Privacy Rights (GDPR / UK GDPR / CCPA)</h2>
          <p>
            Regardless of where you live, you have the right to access, export,
            correct, or permanently erase your personal data:
          </p>
          <ul>
            <li>
              <strong>Self-Service Data Export:</strong> Sign in and open{" "}
              <Link to="/dashboard">Profile → Privacy &amp; Data</Link> to
              download a JSON copy of your profile, watchlist, custom lists, and
              reviews.
            </li>
            <li>
              <strong>Self-Service Account Deletion:</strong> Open{" "}
              <Link to="/dashboard">Profile → Privacy &amp; Data</Link> to
              permanently delete your account and cascade-remove your reviews,
              watchlists, and lists.
            </li>
            <li>
              <strong>Direct Requests:</strong> You may also email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for
              access, correction, or erasure requests.
            </li>
          </ul>
        </section>

        <section className="ct-legal-section">
          <h2>5. Children&apos;s Privacy (COPPA &amp; GDPR-K)</h2>
          <p>
            Comic Traffic is intended for users aged{" "}
            <strong>13 and older</strong> (or <strong>16 and older</strong> in
            the EEA and UK where required by local law). We do not knowingly
            collect personal information from children below these thresholds.
            If you believe a child has created an account, please contact{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> so we can
            promptly delete the account.
          </p>
        </section>

        <section className="ct-legal-section">
          <h2>6. Data Retention &amp; Contact</h2>
          <p>
            We retain account data only for as long as your account remains
            active, or until you delete it. Password reset tokens expire
            automatically after 15 minutes. Questions about this policy may be
            sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </article>
    </main>
  </div>
);

export const TermsOfServicePage: React.FC = () => (
  <div className="ct-legal-page">
    <Nav />
    <main className="ct-legal-container">
      <LegalNavTabs active="terms" />
      <article className="ct-legal-card">
        <span className="ct-legal-badge">Non-Commercial Terms</span>
        <h1>Terms of Service</h1>
        <p className="ct-legal-updated">
          Effective Date: {EFFECTIVE_DATE} • Website: https://comictraffic.com
        </p>

        <p>
          By accessing or creating an account on Comic Traffic
          (https://comictraffic.com), you agree to these Terms of Service and
          our <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <section className="ct-legal-section">
          <h2>1. Non-Commercial Purpose</h2>
          <p>
            Comic Traffic is a free, non-commercial community and educational
            rating aggregator. You may not scrape, bulk-export, resell, or
            commercially exploit data or third-party metadata accessed through
            Comic Traffic.
          </p>
        </section>

        <section className="ct-legal-section">
          <h2>2. Eligibility &amp; Accounts</h2>
          <ul>
            <li>
              You must be at least <strong>13 years old</strong> (or{" "}
              <strong>16 years old</strong> in the EEA/UK) to create an account
              or post community reviews.
            </li>
            <li>
              You are responsible for safeguarding your password and for all
              activity under your account.
            </li>
            <li>
              You may delete your account at any time from your{" "}
              <Link to="/dashboard">Profile → Privacy &amp; Data</Link> tab.
            </li>
          </ul>
        </section>

        <section className="ct-legal-section">
          <h2>3. User-Generated Content &amp; Acceptable Use</h2>
          <p>
            You retain ownership of the reviews, headlines, and lists you post
            on Comic Traffic. By submitting content, you grant Comic Traffic a
            non-exclusive, royalty-free, worldwide license to host, display, and
            aggregate your score into community averages until you delete the
            content or your account.
          </p>
          <p>You agree not to post content that:</p>
          <ul>
            <li>
              Infringes any copyright, trademark, privacy, or publicity right;
            </li>
            <li>
              Contains harassment, hate speech, threats, doxxing, or defamatory
              statements;
            </li>
            <li>
              Consists of spam, automated vote manipulation, malware links, or
              deliberately unmarked major plot spoilers.
            </li>
          </ul>
          <p>
            We reserve the right to remove reported content or suspend accounts
            that violate these rules. Anyone may flag a review using the{" "}
            <strong>Report</strong> control on any review card.
          </p>
        </section>

        <section className="ct-legal-section">
          <h2>4. Third-Party Trademarks &amp; Non-Affiliation Disclaimer</h2>
          <p>
            All movie, television, anime, manga, book, and comic book titles,
            artwork, synopses, and third-party platform names (including TMDB,
            IMDb, OMDb, Rotten Tomatoes, Metacritic, MDBList, Trakt.tv,
            Letterboxd, TVMaze, AniList, MyAnimeList, ComicVine, Hardcover,
            Google Books, Open Library, Apple Books, Marvel, DC, Warner Bros.,
            Sony, Image, and Netflix) are the property of their respective
            owners and are referenced solely for identification, commentary, and
            criticism.{" "}
            <strong>
              Comic Traffic is not affiliated with, endorsed by, certified by,
              or sponsored by any of these organizations.
            </strong>
          </p>
        </section>

        <section className="ct-legal-section">
          <h2>5. Disclaimers &amp; Limitation of Liability</h2>
          <p>
            Comic Traffic is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind. External API scores
            and cached fallback catalog entries may occasionally lag behind
            upstream platforms or be temporarily unavailable. To the maximum
            extent permitted by law, Comic Traffic and its maintainers are not
            liable for indirect, incidental, or consequential damages arising
            from your use of the platform.
          </p>
        </section>

        <section className="ct-legal-section">
          <h2>6. Copyright &amp; Contact</h2>
          <p>
            To report copyright infringement or submit a DMCA takedown notice,
            follow the instructions on our{" "}
            <Link to="/legal/attributions">API Attributions &amp; DMCA</Link>{" "}
            page or email <a href={`mailto:${DMCA_EMAIL}`}>{DMCA_EMAIL}</a>.
          </p>
        </section>
      </article>
    </main>
  </div>
);

export const AttributionsDmcaPage: React.FC = () => (
  <div className="ct-legal-page">
    <Nav />
    <main className="ct-legal-container">
      <LegalNavTabs active="attributions" />
      <article className="ct-legal-card">
        <span className="ct-legal-badge">Data Credits, Licenses &amp; Copyright</span>
        <h1>API Attributions, Licenses &amp; DMCA Notice</h1>
        <p className="ct-legal-updated">
          Effective Date: {EFFECTIVE_DATE} • Non-Commercial Community Project
        </p>

        <div className="ct-tmdb-notice-box">
          <TmdbAttributionMark />
          <p>
            <strong>TMDB Attribution Notice:</strong> This website uses TMDB and
            the TMDB APIs but is not endorsed, certified, or otherwise approved
            by TMDB.
          </p>
        </div>

        <section className="ct-legal-section">
          <h2>1. Data Sources, Attributions &amp; Links</h2>
          <p>
            Live searches query public APIs directly and display each
            provider&apos;s reported score without fabricating or synthesizing
            ratings. Initial curated showcase entries may display cached
            metadata until refreshed via live search.
          </p>

          <div className="ct-legal-table-wrap">
            <table className="ct-legal-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Scope</th>
                  <th>License / Attribution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <a
                      href="https://www.themoviedb.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      The Movie Database (TMDB)
                    </a>
                  </td>
                  <td>Movies &amp; TV metadata, ratings, posters</td>
                  <td>Non-commercial TMDB API; not endorsed or certified by TMDB.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://www.tvmaze.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      TVMaze
                    </a>
                  </td>
                  <td>TV series metadata &amp; ratings</td>
                  <td>
                    Licensed under{" "}
                    <a
                      href="https://creativecommons.org/licenses/by-sa/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CC BY-SA 4.0
                    </a>
                    .
                  </td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://comicvine.gamespot.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Comic Vine
                    </a>
                  </td>
                  <td>Comic book volumes, publishers &amp; covers</td>
                  <td>Non-commercial Comic Vine API; links back to Comic Vine.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://anilist.co/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      AniList
                    </a>
                  </td>
                  <td>Anime &amp; Manga metadata &amp; scores</td>
                  <td>Free non-commercial GraphQL API.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://myanimelist.net/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MyAnimeList
                    </a>{" "}
                    via{" "}
                    <a
                      href="https://jikan.moe/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Jikan
                    </a>
                  </td>
                  <td>Manga metadata &amp; community scores</td>
                  <td>Open-source Jikan API (MIT); unaffiliated with MyAnimeList.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://openlibrary.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Library
                    </a>
                  </td>
                  <td>Books &amp; graphic novel metadata, covers &amp; ratings</td>
                  <td>Internet Archive open public book catalog.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://books.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Books
                    </a>
                  </td>
                  <td>Book/comic descriptions, covers &amp; ratings</td>
                  <td>Google Books API; not endorsed by Google.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://books.apple.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apple Books / iTunes
                    </a>
                  </td>
                  <td>eBook &amp; movie listings and store links</td>
                  <td>iTunes Search API; store links direct back to Apple Books.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://hardcover.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Hardcover
                    </a>
                  </td>
                  <td>Book/graphic novel metadata &amp; reader ratings</td>
                  <td>Hardcover GraphQL API (optional personal/non-commercial lookup).</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://www.omdbapi.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OMDb
                    </a>{" "}
                    &amp;{" "}
                    <a
                      href="https://mdblist.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MDBList
                    </a>
                  </td>
                  <td>
                    External score references (IMDb, Rotten Tomatoes,
                    Metacritic, Trakt.tv, Letterboxd)
                  </td>
                  <td>
                    Non-commercial personal reference lookups; all marks belong
                    to their respective owners.
                  </td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://rawg.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      RAWG Video Games Database
                    </a>
                  </td>
                  <td>PC, console, indie &amp; mobile game metadata, ratings &amp; Metacritic</td>
                  <td>Non-commercial RAWG API; requires attribution link back to RAWG.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://www.cheapshark.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CheapShark / Steam
                    </a>
                  </td>
                  <td>PC &amp; Steam game user review percentages and Metacritic scores</td>
                  <td>Public CheapShark API; links back to Steam / Metacritic.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://apps.apple.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apple App Store Games
                    </a>
                  </td>
                  <td>Mobile games (iOS/iPadOS) ratings, icons &amp; store links</td>
                  <td>Apple iTunes Search API; links direct back to the App Store.</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://boardgamegeek.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      BoardGameGeek
                    </a>
                  </td>
                  <td>Board &amp; tabletop game ratings, player counts &amp; artwork</td>
                  <td>BoardGameGeek XML API2 (non-commercial, attributed link-back).</td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="https://unsplash.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Unsplash
                    </a>
                  </td>
                  <td>Fallback editorial photography</td>
                  <td>Used under the Unsplash License.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="ct-legal-section" id="dmca">
          <h2>2. Copyright &amp; DMCA Takedown Procedure</h2>
          <p>
            Comic Traffic respects intellectual property rights and promptly
            responds to valid notices of alleged copyright infringement (17
            U.S.C. § 512 / equivalent local laws). If you believe content, a
            user review, or a displayed image on Comic Traffic infringes your
            copyright, please email{" "}
            <a href={`mailto:${DMCA_EMAIL}`}>{DMCA_EMAIL}</a> (or{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>) with:
          </p>
          <ol>
            <li>
              Identification of the copyrighted work claimed to have been
              infringed.
            </li>
            <li>
              The specific URL, title ID, or review text location on
              comictraffic.com so we can locate and remove it promptly.
            </li>
            <li>
              Your full name, mailing address, telephone number, and email
              address.
            </li>
            <li>
              A statement that you have a good-faith belief that the disputed
              use is not authorized by the copyright owner, its agent, or the
              law.
            </li>
            <li>
              A statement, made under penalty of perjury, that the information
              in your notice is accurate and that you are the copyright owner or
              authorized to act on the owner&apos;s behalf, accompanied by your
              physical or electronic signature.
            </li>
          </ol>
          <div className="ct-legal-callout">
            <strong>Quick Removal:</strong> Verified copyright takedown requests
            and user-reported infringement flags are reviewed promptly and
            infringing material is removed or disabled expeditiously.
          </div>
        </section>

        <section className="ct-legal-section">
          <h2>3. Open-Source Software Acknowledgments</h2>
          <p>
            Built with open-source software including React (MIT), MobX (MIT),
            React Router (MIT), Vite (MIT), Axios (MIT), ASP.NET Core (MIT),
            Entity Framework Core (MIT), Npgsql (PostgreSQL License), and
            MediatR 12.2 (Apache 2.0).
          </p>
        </section>
      </article>
    </main>
  </div>
);
