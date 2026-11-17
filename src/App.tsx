import React from "react";
import "./App.css";
import { Outlet } from "react-router-dom";
import ScrollToTopButton from "./features/common/ScrollToTopButton";

function App() {
  return (
    <div className="App">
      <Outlet />
      <ScrollToTopButton />
    </div>
  );
}

export default App;
