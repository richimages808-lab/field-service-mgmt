/**
 * Weather Service — OpenWeatherMap integration
 *
 * Uses the free tier of OpenWeatherMap (One Call 3.0 is paid, so we stick
 * with the free `/weather` + `/forecast` endpoints).
 *
 * Falls back to mock data when no API key is configured.
 */

// ─── Types ───────────────────────────────────────────────────────────
export type WeatherCondition =
    | 'clear'
    | 'clouds'
    | 'rain'
    | 'snow'
    | 'thunderstorm'
    | 'mist'
    | 'extreme';

export interface WeatherData {
    temp: number;           // °F
    feelsLike: number;      // °F
    humidity: number;       // %
    windSpeed: number;      // mph
    description: string;
    icon: string;           // OpenWeatherMap icon code
    condition: WeatherCondition;
    alerts?: string[];
}

export interface ForecastDay {
    date: Date;
    high: number;
    low: number;
    condition: WeatherCondition;
    description: string;
    precipitation: number;   // % chance
}

// ─── Config ──────────────────────────────────────────────────────────
const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export const hasApiKey = (): boolean =>
    !!API_KEY && API_KEY !== 'your_api_key_here';

// ─── Helpers ─────────────────────────────────────────────────────────
function mapCondition(mainCondition: string): WeatherCondition {
    const lower = mainCondition.toLowerCase();
    if (lower === 'clear') return 'clear';
    if (lower === 'clouds') return 'clouds';
    if (['rain', 'drizzle'].includes(lower)) return 'rain';
    if (lower === 'snow') return 'snow';
    if (lower === 'thunderstorm') return 'thunderstorm';
    if (['mist', 'fog', 'haze', 'smoke', 'dust', 'sand', 'ash', 'squall'].includes(lower)) return 'mist';
    if (lower === 'tornado') return 'extreme';
    return 'clear';
}

// ─── Real API  ───────────────────────────────────────────────────────
async function fetchCurrentWeather(lat: number, lng: number): Promise<WeatherData> {
    const url = `${BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=imperial`;
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const main = data.weather?.[0]?.main ?? 'Clear';
    const desc = data.weather?.[0]?.description ?? '';

    return {
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        description: desc.charAt(0).toUpperCase() + desc.slice(1),
        icon: data.weather?.[0]?.icon ?? '01d',
        condition: mapCondition(main),
        alerts: undefined // free tier doesn't include alerts
    };
}

async function fetchForecast(lat: number, lng: number): Promise<ForecastDay[]> {
    const url = `${BASE_URL}/forecast?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=imperial`;
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Forecast API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // The free /forecast endpoint returns 3-hour intervals for 5 days.
    // Aggregate into daily highs/lows.
    const dailyMap = new Map<string, {
        highs: number[];
        lows: number[];
        conditions: string[];
        descriptions: string[];
        pops: number[];
    }>();

    for (const entry of data.list) {
        const dateStr = entry.dt_txt.split(' ')[0]; // "YYYY-MM-DD"
        if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, {
                highs: [],
                lows: [],
                conditions: [],
                descriptions: [],
                pops: []
            });
        }
        const day = dailyMap.get(dateStr)!;
        day.highs.push(entry.main.temp_max);
        day.lows.push(entry.main.temp_min);
        day.conditions.push(entry.weather[0].main);
        day.descriptions.push(entry.weather[0].description);
        day.pops.push(Math.round((entry.pop ?? 0) * 100));
    }

    const forecastDays: ForecastDay[] = [];
    for (const [dateStr, agg] of dailyMap) {
        if (forecastDays.length >= 5) break;

        // Pick most common condition
        const conditionCounts = new Map<string, number>();
        for (const c of agg.conditions) {
            conditionCounts.set(c, (conditionCounts.get(c) ?? 0) + 1);
        }
        let dominantCondition = 'Clear';
        let maxCount = 0;
        for (const [cond, cnt] of conditionCounts) {
            if (cnt > maxCount) {
                maxCount = cnt;
                dominantCondition = cond;
            }
        }

        // Pick the description matching the dominant condition
        const descIndex = agg.conditions.indexOf(dominantCondition);
        const rawDesc = agg.descriptions[descIndex] ?? dominantCondition;

        forecastDays.push({
            date: new Date(dateStr + 'T12:00:00'),
            high: Math.round(Math.max(...agg.highs)),
            low: Math.round(Math.min(...agg.lows)),
            condition: mapCondition(dominantCondition),
            description: rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1),
            precipitation: Math.max(...agg.pops)
        });
    }

    return forecastDays;
}

// ─── Mock data (fallback) ────────────────────────────────────────────
function getMockWeather(lat: number, _lng: number): WeatherData {
    const baseTemp = 75 - Math.abs(lat - 21.3) * 2;
    const conditions: WeatherCondition[] = ['clear', 'clouds', 'rain'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    return {
        temp: Math.round(baseTemp + Math.random() * 10 - 5),
        feelsLike: Math.round(baseTemp + Math.random() * 5),
        humidity: Math.round(50 + Math.random() * 40),
        windSpeed: Math.round(5 + Math.random() * 15),
        description: condition === 'clear' ? 'Sunny' : condition === 'clouds' ? 'Partly Cloudy' : 'Light Rain',
        icon: condition === 'clear' ? '01d' : condition === 'clouds' ? '03d' : '10d',
        condition,
        alerts: Math.random() > 0.8 ? ['Heat Advisory in effect until 6 PM'] : undefined
    };
}

function getMockForecast(lat: number, _lng: number): ForecastDay[] {
    const forecast: ForecastDay[] = [];
    const baseTemp = 75 - Math.abs(lat - 21.3) * 2;
    const conditions: WeatherCondition[] = ['clear', 'clouds', 'rain', 'clear', 'clouds'];

    for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const condition = conditions[i % conditions.length];

        forecast.push({
            date,
            high: Math.round(baseTemp + 5 + Math.random() * 5),
            low: Math.round(baseTemp - 10 + Math.random() * 5),
            condition,
            description: condition === 'clear' ? 'Sunny' : condition === 'clouds' ? 'Cloudy' : 'Rain',
            precipitation: condition === 'rain'
                ? Math.round(40 + Math.random() * 40)
                : Math.round(Math.random() * 20)
        });
    }

    return forecast;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetch current weather. Uses real API if key is set, otherwise mock data.
 */
export async function getWeather(
    lat: number,
    lng: number
): Promise<WeatherData> {
    if (hasApiKey()) {
        return fetchCurrentWeather(lat, lng);
    }
    // Simulate network delay for mock
    await new Promise(r => setTimeout(r, 300));
    return getMockWeather(lat, lng);
}

/**
 * Fetch 5-day forecast. Uses real API if key is set, otherwise mock data.
 */
export async function getForecast(
    lat: number,
    lng: number
): Promise<ForecastDay[]> {
    if (hasApiKey()) {
        return fetchForecast(lat, lng);
    }
    await new Promise(r => setTimeout(r, 300));
    return getMockForecast(lat, lng);
}

/**
 * Try to get the user's current position via browser Geolocation API.
 * Returns null if denied or unavailable.
 */
export function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 5000, maximumAge: 600_000 } // cache for 10 min
        );
    });
}
