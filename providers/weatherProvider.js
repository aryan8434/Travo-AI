import axios from "axios";

const API_KEY = process.env.WEATHER_API_KEY;

export async function fetchWeather(city) {
  if (!city || !API_KEY) return null;

  const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(city)}&aqi=no`;

  try {
    const response = await axios.get(url, { timeout: 7000 });
    const data = response.data;

    if (!data || !data.location || !data.current) {
      console.error("Invalid Weather API response structure:", data);
      return null;
    }

    return {
      city: data.location.name || "Unknown City",
      region: data.location.region || "",
      temp_c: data.current.temp_c ?? "N/A",
      condition: data.current.condition?.text || "Unknown Condition",
      icon: data.current.condition?.icon || "",
      humidity: data.current.humidity,
      wind_kph: data.current.wind_kph
    };
  } catch (error) {
    console.error("Weather API Error:", error.message);
    return null;
  }
}
