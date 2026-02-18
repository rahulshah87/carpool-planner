import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [address, setAddress] = useState(user?.home_address || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [acReady, setAcReady] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState<boolean>(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const acContainerRef = useRef<HTMLDivElement>(null);
  const placeAcRef = useRef<any>(null);

  // Load notify_email from profile
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.notify_email !== undefined) setNotifyEmail(data.notify_email); })
      .catch(() => {});
  }, []);

  // Try to attach Google Places PlaceAutocompleteElement as an optional enhancement.
  // If the API key is missing or invalid, the plain text input works fine
  // and the server geocodes the address on save.
  useEffect(() => {
    let cancelled = false;

    const initAutocomplete = () => {
      if (cancelled || !acContainerRef.current || placeAcRef.current) return;
      const PlaceAC = (window as any).google?.maps?.places?.PlaceAutocompleteElement;
      if (!PlaceAC) return;
      try {
        const el = new PlaceAC({
          types: ['address'],
          componentRestrictions: { country: 'us' },
        });
        acContainerRef.current.appendChild(el);
        el.addEventListener('gmp-placeselect', async (e: any) => {
          await e.place.fetchFields({ fields: ['formattedAddress'] });
          setAddress(e.place.formattedAddress || '');
        });
        placeAcRef.current = el;
        setAcReady(true);
      } catch {
        // Autocomplete failed to init — text input still works
      }
    };

    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        if (cancelled || !config.mapsApiKey) return;

        // Already loaded from a previous visit
        if ((window as any).google?.maps?.places?.PlaceAutocompleteElement) {
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
    // Read from PlaceAutocompleteElement if available (captures free-text entry too),
    // otherwise fall back to controlled input state.
    const finalAddress = placeAcRef.current?.value?.trim() || address;
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_address: finalAddress }),
      });
      if (res.ok) {
        if (finalAddress !== address) setAddress(finalAddress);
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

  const handleNotifyToggle = useCallback(async () => {
    const next = !notifyEmail;
    setNotifySaving(true);
    setNotifyMessage('');
    try {
      const res = await fetch('/api/profile/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_email: next }),
      });
      if (res.ok) {
        setNotifyEmail(next);
        setNotifyMessage(next ? 'Email notifications enabled.' : 'Email notifications disabled.');
      } else {
        setNotifyMessage('Failed to update preference.');
      }
    } catch {
      setNotifyMessage('Network error.');
    } finally {
      setNotifySaving(false);
    }
  }, [notifyEmail]);

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
          {/* PlaceAutocompleteElement container — always in DOM so the ref is available,
              shown only after Maps loads successfully */}
          <div ref={acContainerRef} style={{ display: acReady ? 'block' : 'none' }} />
          {!acReady && (
            <input
              ref={inputRef}
              type="text"
              className="input"
              placeholder="Start typing your address..."
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || (!acReady && !address.trim())}
          className="btn btn-primary"
        >
          {saving ? 'Saving...' : 'Save Address'}
        </button>
        {message && <p className="form-message">{message}</p>}
      </div>

      <div className="card">
        <h2>Notifications</h2>
        <p className="text-muted">
          Choose how you want to be notified when someone expresses interest in carpooling with you.
        </p>
        <div className="form-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={handleNotifyToggle}
              disabled={notifySaving}
            />
            {' '}Email me when someone is interested in carpooling with me
          </label>
        </div>
        {notifyMessage && <p className="form-message">{notifyMessage}</p>}
      </div>
    </div>
  );
}
