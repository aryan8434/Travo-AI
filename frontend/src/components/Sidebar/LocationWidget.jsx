import React, { useState } from 'react';
import { MapPin, Navigation, Compass, CheckCircle2 } from 'lucide-react';

export default function LocationWidget({ activeCity, onCityChange }) {
  const [isDetecting, setIsDetecting] = useState(false);

  const detectLocation = () => {
    setIsDetecting(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            // Free Reverse Geocoding via Nominatim OpenStreetMap API
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const data = await response.json();
            const city = data.address?.city || data.address?.town || data.address?.state_district || 'Delhi';
            onCityChange(city);
          } catch {
            onCityChange('Delhi');
          } finally {
            setIsDetecting(false);
          }
        },
        (error) => {
          console.warn('Geolocation denied or failed:', error.message);
          setIsDetecting(false);
        }
      );
    } else {
      setIsDetecting(false);
    }
  };



  return (
    <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400">
          <Navigation className="w-4 h-4 text-emerald-400" />
          <span>Current Location</span>
        </div>
        <button
          onClick={detectLocation}
          disabled={isDetecting}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-medium"
        >
          {isDetecting ? 'Locating...' : 'Refresh'}
        </button>
      </div>

      <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{activeCity || 'Delhi'}</div>
            <span className="text-[10px] text-slate-400">Selected travel city</span>
          </div>
        </div>
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      </div>
    </div>
  );
}
