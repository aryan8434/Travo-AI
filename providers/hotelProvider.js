import axios from 'axios';
export async function fetchRealHotels(city) {
  if (typeof city !== 'string' || !process.env.MAKCORPS_API_TOKEN) return [];
  try {
    const { data } = await axios.get(`https://api.makcorps.com/free/${encodeURIComponent(city.split(',')[0].trim().toLowerCase())}`, {
      timeout: 7000, headers: { Authorization: `JWT ${process.env.MAKCORPS_API_TOKEN}` },
    });
    if (!Array.isArray(data)) return [];
    return data.flatMap(item => {
      const info = item[0], quotes = item[1];
      if (!info?.hotelName || !Array.isArray(quotes)) return [];
      // Do not infer currency from how small a number looks.
      const prices = quotes.filter(q => String(q.currency || info.currency || '').toUpperCase() === 'INR')
        .flatMap(q => [q.price1, q.price2, q.price3, q.price4]).map(Number)
        .filter(p => Number.isFinite(p) && p >= 1);
      if (!prices.length) return [];
      return [{ name: info.hotelName, city, price: Math.round(Math.min(...prices) * 100) / 100, currency: 'INR', rating: Number.isFinite(Number(info.rating)) ? Number(info.rating) : null }];
    });
  } catch { return []; }
}
