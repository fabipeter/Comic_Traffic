import React, { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../app/stores/store";

const ScrollToTopButton: React.FC = () => {
  const { ratingStore } = useStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 280) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      scrollToTop();
    }
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      className={`ct-scroll-to-top-btn ${
        ratingStore.communityDrawerOpen ? "drawer-open" : ""
      }`}
      onClick={scrollToTop}
      onKeyDown={handleKeyDown}
      aria-label="Scroll to top of page"
      title="Scroll to top"
    >
      <svg
        className="ct-scroll-to-top-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
      <span className="ct-scroll-tooltip">Top</span>
    </button>
  );
};

export default observer(ScrollToTopButton);
