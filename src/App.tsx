import React from "react";
import "./App.css";
import { Outlet } from "react-router-dom";
import ScrollToTopButton from "./features/common/ScrollToTopButton";
import {
  CumulativeDetailModal,
  CompareModal,
  CustomWeightsModal,
  KeyboardShortcutsModal,
} from "./features/home/CumulativeModals";

function App() {
  return (
    <div className="App">
      <Outlet />
      <CumulativeDetailModal />
      <CompareModal />
      <CustomWeightsModal />
      <KeyboardShortcutsModal />
      <ScrollToTopButton />
    </div>
  );
}

export default App;
