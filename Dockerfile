# =============================================================================
# Comic Traffic .NET 10 API — Production Multi-Stage Container
# Compatible with Railway, Render, Fly.io, Azure App Service, and AWS ECS/Cloud Run
# =============================================================================

# Stage 1: Build & Publish
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore dependencies separately for layer caching
COPY backend/ComicTraffic.Api/ComicTraffic.Api.csproj backend/ComicTraffic.Api/
RUN dotnet restore backend/ComicTraffic.Api/ComicTraffic.Api.csproj

# Copy source code and compile Release
COPY backend/ComicTraffic.Api/ backend/ComicTraffic.Api/
WORKDIR /src/backend/ComicTraffic.Api
RUN dotnet publish ComicTraffic.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Minimal Production Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_EnableDiagnostics=0

COPY --from=build /app/publish .

# Run with non-root app user
USER $APP_UID

EXPOSE 8080

ENTRYPOINT ["dotnet", "ComicTraffic.Api.dll"]
