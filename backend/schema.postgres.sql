-- =============================================================================
-- Comic Traffic — Google Cloud SQL for PostgreSQL Production Schema
-- Industry-standard constraints, parameterized query compatibility, & least-privilege RBAC
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "Username" VARCHAR(60) NOT NULL UNIQUE,
    "Email" VARCHAR(180) NOT NULL UNIQUE,
    "PasswordHash" TEXT NOT NULL,
    "DisplayName" VARCHAR(120) NOT NULL,
    "Bio" VARCHAR(600) NOT NULL DEFAULT '',
    "AvatarUrl" TEXT NOT NULL DEFAULT '/default-avatar.svg',
    "Role" VARCHAR(32) NOT NULL DEFAULT 'User',
    "FavoriteGenresCsv" VARCHAR(500) NOT NULL DEFAULT '',
    "PreferredWeightsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "PasswordResetToken" VARCHAR(200),
    "PasswordResetExpiresAt" TIMESTAMPTZ,
    "PasswordResetFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "TermsAcceptedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_items (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ExternalId" VARCHAR(128) NOT NULL UNIQUE,
    "Title" VARCHAR(240) NOT NULL,
    "MediaType" INTEGER NOT NULL,
    "ReleaseYear" INTEGER NOT NULL CHECK ("ReleaseYear" BETWEEN 1900 AND 2100),
    "Overview" TEXT NOT NULL DEFAULT '',
    "PosterUrl" TEXT NOT NULL DEFAULT '',
    "BackdropUrl" TEXT NOT NULL DEFAULT '',
    "GenresCsv" VARCHAR(400) NOT NULL DEFAULT '',
    "PublisherOrStudio" VARCHAR(180) NOT NULL DEFAULT '',
    "CreatorOrDirector" VARCHAR(180) NOT NULL DEFAULT '',
    "RuntimeOrIssueCount" VARCHAR(120) NOT NULL DEFAULT '',
    "AgeRating" VARCHAR(32) NOT NULL DEFAULT 'PG-13',
    "ExternalRatingsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "FinalCumulativeAverage" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("FinalCumulativeAverage" BETWEEN 0 AND 100),
    "BayesianWeightedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "CriticConsensusScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "AudienceConsensusScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "PolarizationIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ConsensusTier" VARCHAR(80) NOT NULL DEFAULT 'Favorable',
    "TotalVoteCount" INTEGER NOT NULL DEFAULT 0,
    "LastUpdated" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items ("MediaType");
CREATE INDEX IF NOT EXISTS idx_media_items_cumulative ON media_items ("FinalCumulativeAverage" DESC);

CREATE TABLE IF NOT EXISTS user_reviews (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" UUID NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
    "Username" VARCHAR(60) NOT NULL,
    "UserAvatarUrl" TEXT NOT NULL DEFAULT '',
    "ExternalMediaId" VARCHAR(128) NOT NULL,
    "MediaTitle" VARCHAR(240) NOT NULL,
    "MediaType" INTEGER NOT NULL,
    "Score" DOUBLE PRECISION NOT NULL CHECK ("Score" BETWEEN 0 AND 100),
    "Headline" VARCHAR(200) NOT NULL,
    "ReviewText" VARCHAR(2500) NOT NULL,
    "ContainsSpoilers" BOOLEAN NOT NULL DEFAULT FALSE,
    "HelpfulVotes" INTEGER NOT NULL DEFAULT 1,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reviews_media ON user_reviews ("ExternalMediaId");
CREATE INDEX IF NOT EXISTS idx_user_reviews_user ON user_reviews ("UserId");

CREATE TABLE IF NOT EXISTS watchlist_items (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" UUID NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
    "ExternalMediaId" VARCHAR(128) NOT NULL,
    "Title" VARCHAR(240) NOT NULL,
    "MediaType" INTEGER NOT NULL,
    "PosterUrl" TEXT NOT NULL DEFAULT '',
    "CumulativeAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "UserPersonalScore" DOUBLE PRECISION NULL CHECK ("UserPersonalScore" IS NULL OR ("UserPersonalScore" BETWEEN 0 AND 100)),
    "Status" VARCHAR(40) NOT NULL DEFAULT 'PlanToWatch',
    "Notes" VARCHAR(600) NOT NULL DEFAULT '',
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("UserId", "ExternalMediaId")
);

CREATE TABLE IF NOT EXISTS custom_media_lists (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" UUID NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
    "OwnerUsername" VARCHAR(60) NOT NULL,
    "Name" VARCHAR(160) NOT NULL,
    "Description" VARCHAR(800) NOT NULL DEFAULT '',
    "IsPublic" BOOLEAN NOT NULL DEFAULT TRUE,
    "ExternalMediaIdsCsv" TEXT NOT NULL DEFAULT '',
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_lists_user ON custom_media_lists ("UserId");

CREATE TABLE IF NOT EXISTS content_reports (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ReviewId" UUID NULL,
    "ExternalMediaId" VARCHAR(128) NOT NULL DEFAULT '',
    "ReporterUserId" UUID NULL,
    "Reason" VARCHAR(80) NOT NULL DEFAULT 'Other',
    "Details" VARCHAR(1000) NOT NULL DEFAULT '',
    "Status" VARCHAR(32) NOT NULL DEFAULT 'Open',
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_review ON content_reports ("ReviewId");
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports ("Status");
