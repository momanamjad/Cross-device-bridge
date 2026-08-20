import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Messages" },
  { to: "/calls", label: "Calls" },
  { to: "/settings", label: "Settings" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-ink/95 backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `py-3 text-center text-sm ${isActive ? "text-mint" : "text-slate-400"}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
