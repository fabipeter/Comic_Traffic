import React from "react";
import { ReactComponent as Sun } from "./Sun.svg";
import { ReactComponent as Moon } from "./Moon.svg";
import "./DarkMode.css";
import { observer } from "mobx-react-lite";

const DarkMode = () => {
  const setDarkMode = () => {
    document.querySelector("body")!.setAttribute("data-theme", "dark");
    localStorage.setItem("selectedTheme", "dark");
  };
  const setLightMode = () => {
    document.querySelector("body")!.setAttribute("data-theme", "light");
    localStorage.setItem("selectedTheme", "light");
  };
  const selectedTheme = localStorage.getItem("selectedTheme");
  if (selectedTheme !== "light") setDarkMode();
  const toggleTheme = (e: any) => {
    if (e.target.checked) setDarkMode();
    else setLightMode();
  };
  return (
    <div className="dark_mode">
      <input
        className="dark_mode_input"
        type="checkbox"
        id="darkmode-toggle"
        onChange={toggleTheme}
        defaultChecked={selectedTheme !== "light"}
      />
      <label className="dark_mode_label" htmlFor="darkmode-toggle">
        <Sun />
        <Moon />
      </label>
    </div>
  );
};

export default observer(DarkMode);
