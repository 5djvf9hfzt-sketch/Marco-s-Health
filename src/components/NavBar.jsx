import React from "react";

const ICONS = {
  home: (
    <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  ),
  trends: <path d="M3 17.5 9 11l4 4 8-8.5M21 6.5h-5m5 0v5" />,
  lifestyle: <path d="M4 7h16M4 12h16M4 17h10" />,
  insights: (
    <path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.4-.9 1-.9 1.7v.4H9.4v-.4c0-.7-.3-1.3-.9-1.7A6 6 0 0 1 12 3ZM9.8 20h4.4" />
  ),
};

const ITEMS = [
  { key: "home", label: "Home" },
  { key: "trends", label: "Trends" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "insights", label: "Insights" },
];

export default function NavBar({ current, onNavigate }) {
  return (
    <nav className="nav-bar">
      <div className="nav-bar-inner">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${current === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
            aria-current={current === item.key ? "page" : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICONS[item.key]}
            </svg>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
