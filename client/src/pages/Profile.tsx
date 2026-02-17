import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    google?: typeof google;
  }
}

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [address, setAddress] = useState(user?.home_address || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Load Google Maps Places Autocomplete
  useEffect(() => {
    let script: HTMLScriptElement | null = null;

    const initAutocomplete = () => {
      if (!inputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current!.getPlace();
        if (place.formatted_address) {
          setAddress(place.formatted_address);
        }
      });
    };

    // Fetch Maps API key and load the script
    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        if (!config.mapsApiKey) return;
        if (window.google?.maps?.places) {
          initAutocomplete();
          return;
        }
        script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&libraries=places`;
        script.async = true;
        script.onload = initAutocomplete;
        document.head.appendChild(script);
      });

    return () => {
      if (script) document.head.removeChild(script);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_address: address }),
      });
      if (res.ok) {
        await refreshUser();
        setMessage('Address saved!');
      } else {
        const err = await res.json();
        setMessage(err.error || 'Failed to save');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }, [address, refreshUser]);

  return (
    <div className="page">
      <h1>Profile</h1>

      <div className="card">
        <div className="profile-info">
          {user?.avatar_url && <img src={user.avatar_url} alt="" className="avatar-large" />}
          <div>
            <h2>{user?.display_name}</h2>
            <p className="text-muted">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Home Address</h2>
        <p className="text-muted">
          Used to calculate your commute route. Your exact address is never shown to other users.
        </p>
        <div className="form-group">
          <label htmlFor="address">Address</label>
          <input
            ref={inputRef}
            id="address"
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Start typing your address..."
            className="input"
          />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : 'Save Address'}
        </button>
        {message && <p className="form-message">{message}</p>}
      </div>
    </div>
  );
}
