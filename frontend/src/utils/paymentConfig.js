import axios from 'axios';
import { useEffect, useState } from 'react';

let pending;

// One request per page load; the banner, every booking card and checkout share it.
export function getPaymentConfig() {
  if (!pending) {
    pending = axios.get('/api/payments/config').then(({ data }) => data || {}).catch(() => {
      pending = null;
      return {};
    });
  }
  return pending;
}

export function usePaymentConfig() {
  const [config, setConfig] = useState({});
  useEffect(() => {
    let active = true;
    getPaymentConfig().then((data) => { if (active) setConfig(data); });
    return () => { active = false; };
  }, []);
  return config;
}

// What confirming an item of this price collects now.
export function chargeFor(price, config) {
  const cap = Number(config?.booking_charge);
  return Number.isFinite(cap) && cap >= 1 ? Math.min(price, cap) : price;
}
