import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  const hasAddress = !!user?.home_address;

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.display_name?.split(' ')[0]}</h1>

      <div className="setup-checklist">
        <h2>Getting Started</h2>
        <div className="checklist">
          <div className={`checklist-item ${hasAddress ? 'done' : ''}`}>
            <span className="check">{hasAddress ? '✓' : '1'}</span>
            <div>
              <strong>Set your home address</strong>
              <p>We need this to calculate commute routes and find nearby matches.</p>
              <Link to="/profile" className="btn btn-small">
                {hasAddress ? 'Update address' : 'Add address'}
              </Link>
            </div>
          </div>

          <div className="checklist-item">
            <span className="check">2</span>
            <div>
              <strong>Set your commute schedule</strong>
              <p>Tell us when you commute and whether you can drive, ride, or either.</p>
              <Link to="/preferences" className="btn btn-small">Set schedule</Link>
            </div>
          </div>

          <div className="checklist-item">
            <span className="check">3</span>
            <div>
              <strong>Find matches</strong>
              <p>See coworkers whose routes and schedules overlap with yours.</p>
              <Link to="/matches" className="btn btn-small">View matches</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
