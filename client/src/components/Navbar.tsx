import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <NavLink to="/">Carpool Planner</NavLink>
      </div>
      <div className="navbar-links">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/preferences">Schedule</NavLink>
        <NavLink to="/matches">Matches</NavLink>
      </div>
      <div className="navbar-user">
        {user?.avatar_url && <img src={user.avatar_url} alt="" className="avatar" />}
        <span className="user-name">{user?.display_name}</span>
        <button onClick={logout} className="btn-logout">Sign out</button>
      </div>
    </nav>
  );
}
