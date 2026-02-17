import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [address, setAddress] = useState(user?.home_address || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  // Try to attach Google Places Autocomplete as an optional enhancement.
  // If the API key is missing or invalid, the plain text input works fine
  // and the server geocodes the address on save.
  useEffect(() => {
    let cancelled = false;

    const initAutocomplete = () => {
      if (cancelled || !inputRef.current) return;
      if (!(window as any).google?.maps?.places?.Autocomplete) return;
      if (autocompleteRef.current) return;

      try {
        const autocomplete = new (window as any).google.maps.places.Autocomplete(
          inputRef.current,
          { types: ['address'], componentRestrictions: { country: 'us' } }
        );
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place?.formatted_address) {
            setAddress(place.formatted_address);
          }
        });
        autocompleteRef.current = autocomplete;
      } catch {
        // Autocomplete failed to init — text input still works
      }
    };

    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        if (cancelled || !config.mapsApiKey) return;

        // Already loaded from a previous visit
        if ((window as any).google?.maps?.places?.Autocomplete) {
          initAutocomplete();
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&libraries=places&v=weekly`;
        script.async = true;
        script.onload = initAutocomplete;
        // Silently ignore script load failures — the text input still works
        script.onerror = () => {};
        document.head.appendChild(script);
      })
      .catch(() => {});

    return () => { cancelled = true; };
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
          <label>{address ? 'Change address' : 'Enter your address'}</label>
          <input
            ref={inputRef}
            type="text"
            className="input"
            placeholder="Start typing your address..."
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>
        <button onClick={handleSave} disabled={saving || !address.trim()} className="btn btn-primary">
          {saving ? 'Saving...' : 'Save Address'}
        </button>
        {message && <p className="form-message">{message}</p>}
      </div>
    </div>
  );
}
