import { NavLink } from "react-router-dom";
import ReviewBadge from "./ReviewBadge";

interface BottomNavProps {
  reviewCount: number;
}

export default function BottomNav({ reviewCount }: BottomNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary">
      <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Home
      </NavLink>
      <NavLink to="/transactions" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Transactions
        <ReviewBadge count={reviewCount} />
      </NavLink>
      <NavLink to="/capture" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Capture
      </NavLink>
      <NavLink to="/categories" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Categories
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Settings
      </NavLink>
    </nav>
  );
}
