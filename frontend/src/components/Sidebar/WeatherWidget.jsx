import React, { useState, useEffect } from 'react';
import { Sun } from 'lucide-react';
import axios from 'axios';
export default function WeatherWidget({ city }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    axios.get('/api/weather', { params: { city }, signal: controller.signal }).then(({ data }) => setWeather(data.weather)).catch(() => {});
    return () => controller.abort();
  }, [city]);
  return <div className="glass-card p-4 rounded-2xl border border-slate-800"><div className="text-sm font-semibold text-slate-200 flex gap-2"><Sun size={16} className="text-amber-300"/>Weather · {city}</div><p className="text-sm text-slate-400 mt-2">{weather ? `${weather.temp_c}°C · ${weather.condition}` : 'Live weather is unavailable.'}</p></div>;
}
