import React from "react";

const ITEMS = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "trends", label: "Trends", icon: "📈" },
  { key: "lifestyle", label: "Lifestyle", icon: "☰" },
  { key: "insights", label: "Insights", icon: "💡" },
];

export default function NavBar({ current, onNavigate }) {
  return (
    <nav className="nav-bar">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          className={current === item.key ? "active" : ""}
          onClick={() => onNavigate(item.key)}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
