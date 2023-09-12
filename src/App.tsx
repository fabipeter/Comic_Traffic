import React, { useEffect, useLayoutEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { Outlet } from "react-router-dom";

function App() {
  // useLayoutEffect(() => {
  //   const selectedTheme = localStorage.getItem("selectedTheme");
  //   console.log(selectedTheme);
  //   if (!selectedTheme) {
  //     document.querySelector("body")!.setAttribute("data-theme", "dark");
  //     localStorage.setItem("selectedTheme", "dark");
  //   }
  // }, []);
  const selectedTheme = localStorage.getItem("selectedTheme");
  if (!selectedTheme) {
    document.querySelector("body")!.setAttribute("data-theme", "dark");
    localStorage.setItem("selectedTheme", "dark");
  }

  return (
    <div className="App">
      <Outlet />
    </div>
  );
}

export default App;
