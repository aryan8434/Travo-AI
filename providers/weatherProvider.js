import axios from "axios";
import { listAirportCities } from "../utils/flightEngine.js";
import { loadAllPackages } from "../utils/ragEngine.js";

const API_KEY = process.env.WEATHER_API_KEY;

// From https://www.weatherapi.com/docs/weather_conditions.json, keyed by icon
// number. Current responses carry only the icon, not the condition text.
const CONDITIONS = {
  113: ["Sunny", "Clear"], 116: "Partly cloudy", 119: "Cloudy", 122: "Overcast",
  125: "Haze", 128: "Dust haze", 131: "Blowing dust", 134: "Dust storm", 137: "Sandstorm",
  140: "Severe sandstorm", 143: "Mist", 146: "Smoke", 149: "Smoky haze", 152: "Smog",
  155: "Severe smog", 158: "Saharan dust", 161: "Dust", 176: "Patchy rain possible",
  179: "Patchy snow possible", 182: "Patchy sleet possible", 185: "Patchy freezing drizzle possible",
  200: "Thundery outbreaks possible", 227: "Blowing snow", 230: "Blizzard", 248: "Fog",
  260: "Freezing fog", 263: "Patchy light drizzle", 266: "Light drizzle", 281: "Freezing drizzle",
  284: "Heavy freezing drizzle", 293: "Patchy light rain", 296: "Light rain",
  299: "Moderate rain at times", 302: "Moderate rain", 305: "Heavy rain at times", 308: "Heavy rain",
  311: "Light freezing rain", 314: "Moderate or heavy freezing rain", 317: "Light sleet",
  320: "Moderate or heavy sleet", 323: "Patchy light snow", 326: "Light snow",
  329: "Patchy moderate snow", 332: "Moderate snow", 335: "Patchy heavy snow", 338: "Heavy snow",
  350: "Ice pellets", 353: "Light rain shower", 356: "Moderate or heavy rain shower",
  359: "Torrential rain shower", 362: "Light sleet showers", 365: "Moderate or heavy sleet showers",
  368: "Light snow showers", 371: "Moderate or heavy snow showers",
  374: "Light showers of ice pellets", 377: "Moderate or heavy showers of ice pellets",
  386: "Patchy light rain with thunder", 389: "Moderate or heavy rain with thunder",
  392: "Patchy light snow with thunder", 395: "Moderate or heavy snow with thunder",
};

export function conditionText(condition = {}) {
  if (condition.text) return condition.text;
  const icon = String(condition.icon || "").match(/\/(day|night)\/(\d+)\.png$/);
  const entry = icon && CONDITIONS[icon[2]];
  if (!entry) return "Unknown Condition";
  return Array.isArray(entry) ? entry[icon[1] === "night" ? 1 : 0] : entry;
}

// WeatherAPI takes the first global match for a bare name ("Delhi" is in
// Ontario, "Manali" is also near Chennai), so places the app knows to be Indian
// are qualified with their state and country. A blanket suffix is wrong:
// "Dubai, India" resolves to a village in Uttar Pradesh.
export function weatherQuery(city) {
  const name = city.trim();
  if (name.includes(",")) return name;
  const key = name.toLowerCase();
  const indianPackages = loadAllPackages().filter((p) => p.country === "India");
  const destination = indianPackages.find((p) => p.destination?.toLowerCase() === key);
  if (destination?.state) return `${name}, ${destination.state}, India`;
  const indian =
    listAirportCities().some((c) => c.toLowerCase() === key) ||
    indianPackages.some((p) => p.state?.toLowerCase() === key);
  return indian ? `${name}, India` : name;
}

export async function fetchWeather(city) {
  if (!city || !API_KEY) return null;

  const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(weatherQuery(city))}&aqi=no`;

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
      country: data.location.country || "",
      temp_c: data.current.temp_c ?? "N/A",
      condition: conditionText(data.current.condition),
      icon: data.current.condition?.icon || "",
      humidity: data.current.humidity,
      wind_kph: data.current.wind_kph
    };
  } catch (error) {
    console.error("Weather API Error:", error.message);
    return null;
  }
}
