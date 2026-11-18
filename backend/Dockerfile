# =============================================================================
# Comic Traffic .NET 10 API — Production Multi-Stage Container (Context: /backend)
# =============================================================================

# Stage 1: Build & Publish
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ComicTraffic.Api/ComicTraffic.Api.csproj ComicTraffic.Api/
RUN dotnet restore ComicTraffic.Api/ComicTraffic.Api.csproj

COPY ComicTraffic.Api/ ComicTraffic.Api/
WORKDIR /src/ComicTraffic.Api
RUN dotnet publish ComicTraffic.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Minimal Production Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_EnableDiagnostics=0

COPY --from=build /app/publish .

USER $APP_UID

EXPOSE 8080

ENTRYPOINT ["dotnet", "ComicTraffic.Api.dll"]
