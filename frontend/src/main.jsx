import React from 'react'
import { MotionConfig } from 'framer-motion'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'

// In dev, Vite proxies /chat /api /user /auth to the backend (see vite.config.js).
// In prod the build is served by Express, so same-origin requests just work.
// Override only if the API lives elsewhere.
if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

// Never forward our account token to a third-party URL.
axios.interceptors.request.use(config => {
  const apiOrigin = new URL(axios.defaults.baseURL || window.location.origin, window.location.origin).origin;
  const target = new URL(config.url, config.baseURL || window.location.origin);
  if (target.origin !== apiOrigin) { delete config.headers.Authorization; config.withCredentials = false; }
  return config;
});
// Attach the auth token (if any) to every request.
const stored = (() => {
  try { return JSON.parse(localStorage.getItem('travoai_user') || 'null'); } catch { return null; }
})();
if (stored?.token) {
  axios.defaults.headers.common.Authorization = `Bearer ${stored.token}`;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user"><App /></MotionConfig>
  </React.StrictMode>,
)
