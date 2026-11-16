import React, { useState, useEffect } from "react";
import "./Row.css";
import tmdbagent from "../../app/api/tmdbagent";
import { observer } from "mobx-react-lite";
import {
  AggregatedMediaItem,
  convertTmdbItemToAggregated,
  MediaCategoryType,
} from "../../app/api/ratingApis";
import { useStore } from "../../app/stores/store";

interface RowProps {
  title: string;
  fetchUrl?: string;
  isLargeRow?: boolean;
  items?: AggregatedMediaItem[];
  categoryFilter?: MediaCategoryType;
}

const Row: React.FC<RowProps> = ({
  title,
  fetchUrl,
  isLargeRow,
  items,
  categoryFilter,
}) => {
  const { ratingStore } = useStore();
  const [fetchedItems, setFetchedItems] = useState<AggregatedMediaItem[]>([]);

  useEffect(() => {
    if (!fetchUrl) return;
    let mounted = true;
    const fetchData = async () => {
      try {
        const request = await tmdbagent.instance.get(fetchUrl);
        const rawList = request.data?.results || [];
        const converted: AggregatedMediaItem[] = rawList
          .filter((m: any) => m && (m.poster_path || m.backdrop_path))
          .map((m: any) => convertTmdbItemToAggregated(m, categoryFilter));

        if (mounted && converted.length > 0) {
          setFetchedItems(converted);
          ratingStore.registerTmdbRowItems(rawList, categoryFilter);
        }
      } catch {
        // Fallback to catalog items if offline or blocked
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, [fetchUrl, categoryFilter, ratingStore]);

  const displayList: AggregatedMediaItem[] =
    items && items.length > 0
      ? items
      : fetchedItems.length > 0
      ? fetchedItems
      : categoryFilter
      ? ratingStore.catalog.filter((c) => c.mediaType === categoryFilter)
      : ratingStore.catalog;

  return (
    <div className="row">
      <div className="row__header_flex">
        <h2 className="row__title">{title}</h2>
        <span className="row__subtitle_badge">
          Multi-API Cumulative Average Verified
        </span>
      </div>

      <div className="row__posters">
        {displayList.map((item) => {
          const avg = item.cumulativeRating.finalCumulativeAverage;
          const badgeColor =
            avg >= 88
              ? "#10b981"
              : avg >= 75
              ? "#3b82f6"
              : avg >= 60
              ? "#f59e0b"
              : "#ef4444";

          return (
            <div
              key={item.externalId}
              className="row__posters_card"
              onClick={() => ratingStore.openDetailModal(item)}
            >
              <div className="row__card_image_wrap">
                <img
                  className={`row__poster ${isLargeRow ? "row__posterLarge" : ""}`}
                  src={isLargeRow ? item.posterUrl : item.backdropUrl || item.posterUrl}
                  alt={item.title}
                  loading="lazy"
                />
                <div
                  className="row__cumulative_badge"
                  style={{ backgroundColor: badgeColor }}
                  title="Final Cumulative Average across all rating APIs"
                >
                  ★ {avg.toFixed(1)}%
                </div>
                <div className="row__mediatype_tag">
                  {item.mediaType === "ComicBook"
                    ? "📚 COMIC"
                    : item.mediaType === "TvSeries"
                    ? "📺 SERIES"
                    : "🎬 MOVIE"}
                </div>
              </div>

              <div className="row__posters_info">
                <h3 className="row__posters_movietitle">{item.title}</h3>
                <div className="row__meta_line">
                  <span>{item.releaseYear}</span>
                  <span>•</span>
                  <span>{item.cumulativeRating.consensusTier}</span>
                </div>
                <div className="row__mini_sources">
                  {item.cumulativeRating.sources.slice(0, 3).map((src) => (
                    <span
                      key={src.sourceId}
                      className="row__mini_source_chip"
                      style={{ borderColor: src.accentColor }}
                    >
                      {src.sourceName.split(" ")[0]}: {src.rawScoreDisplay}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default observer(Row);
