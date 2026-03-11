import React, { useState, useEffect, useCallback } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Thermometer, Droplets, AlertTriangle, RefreshCw, MapPinIcon } from 'lucide-react';
import {
    getWeather,
    getForecast,
    getUserLocation,
    hasApiKey,
    type WeatherData,
    type ForecastDay,
    type WeatherCondition
} from '../lib/weatherService';

interface WeatherWidgetProps {
    location?: { lat: number; lng: number };
    address?: string;
    compact?: boolean;
    showForecast?: boolean;
    onWeatherAlert?: (alert: string) => void;
}

// Weather condition icons
const getWeatherIcon = (condition: WeatherCondition, size: string = 'w-6 h-6') => {
    switch (condition) {
        case 'clear':
            return <Sun className={`${size} text-yellow-500`} />;
        case 'clouds':
            return <Cloud className={`${size} text-gray-500`} />;
        case 'rain':
        case 'thunderstorm':
            return <CloudRain className={`${size} text-blue-500`} />;
        case 'snow':
            return <CloudSnow className={`${size} text-blue-300`} />;
        case 'mist':
            return <Cloud className={`${size} text-gray-400`} />;
        case 'extreme':
            return <AlertTriangle className={`${size} text-red-500`} />;
        default:
            return <Sun className={`${size} text-yellow-500`} />;
    }
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
    location,
    address,
    compact = false,
    showForecast = true,
    onWeatherAlert
}) => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [forecast, setForecast] = useState<ForecastDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [usingRealApi, setUsingRealApi] = useState(false);

    // Resolve location: prop > geolocation > default (Honolulu)
    const effectiveLat = location?.lat ?? userLoc?.lat ?? 21.3099;
    const effectiveLng = location?.lng ?? userLoc?.lng ?? -157.8581;

    // Try to get user location on mount (only if no location prop)
    useEffect(() => {
        if (!location) {
            getUserLocation().then((loc) => {
                if (loc) setUserLoc(loc);
            });
        }
    }, [location]);

    const fetchWeather = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [weatherData, forecastData] = await Promise.all([
                getWeather(effectiveLat, effectiveLng),
                getForecast(effectiveLat, effectiveLng)
            ]);

            setWeather(weatherData);
            setForecast(forecastData);
            setLastUpdated(new Date());
            setUsingRealApi(hasApiKey());

            // Alert on adverse conditions
            if (weatherData.alerts && onWeatherAlert) {
                weatherData.alerts.forEach(alert => onWeatherAlert(alert));
            }
        } catch (err) {
            console.error('Weather fetch error:', err);
            setError('Failed to load weather data');
        }

        setLoading(false);
    }, [effectiveLat, effectiveLng, onWeatherAlert]);

    useEffect(() => {
        fetchWeather();
        // Refresh every 30 minutes
        const interval = setInterval(fetchWeather, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchWeather]);

    // Check for scheduling warnings
    const getSchedulingWarning = () => {
        if (!weather) return null;

        if (weather.temp > 95) {
            return { type: 'warning', message: 'Extreme heat — consider morning scheduling' };
        }
        if (weather.condition === 'rain' || weather.condition === 'thunderstorm') {
            return { type: 'warning', message: 'Rain expected — outdoor work may be delayed' };
        }
        if (weather.windSpeed > 25) {
            return { type: 'caution', message: 'High winds — take caution on rooftop work' };
        }
        if (weather.condition === 'snow') {
            return { type: 'warning', message: 'Snow — plan for travel delays' };
        }
        return null;
    };

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {weather ? getWeatherIcon(weather.condition, 'w-5 h-5') : <Cloud className="w-5 h-5 text-gray-400" />}
                        <div>
                            <span className="font-semibold">
                                {loading ? '--' : weather?.temp}°F
                            </span>
                            <span className="text-xs text-gray-500 ml-1">
                                {weather?.description || 'Loading...'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {!usingRealApi && weather && (
                            <span className="text-[10px] text-gray-400" title="Using demo data — add VITE_OPENWEATHER_API_KEY to .env for live weather">
                                Demo
                            </span>
                        )}
                        {weather?.alerts && weather.alerts.length > 0 && (
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                        )}
                    </div>
                </div>
                {getSchedulingWarning() && (
                    <p className="text-xs text-orange-600 mt-1">{getSchedulingWarning()?.message}</p>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Weather</h3>
                    {!usingRealApi && weather && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Demo</span>
                    )}
                </div>
                <button
                    onClick={fetchWeather}
                    disabled={loading}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    title="Refresh"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error ? (
                <div className="text-red-500 text-sm text-center py-4">{error}</div>
            ) : loading && !weather ? (
                <div className="text-gray-500 text-sm text-center py-4">Loading weather...</div>
            ) : weather && (
                <>
                    {/* Current Weather */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            {getWeatherIcon(weather.condition, 'w-12 h-12')}
                            <div>
                                <p className="text-3xl font-bold text-gray-900">{weather.temp}°F</p>
                                <p className="text-sm text-gray-500">{weather.description}</p>
                            </div>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                            <div className="flex items-center gap-1 justify-end">
                                <Thermometer className="w-3 h-3" />
                                <span>Feels {weather.feelsLike}°</span>
                            </div>
                            <div className="flex items-center gap-1 justify-end">
                                <Droplets className="w-3 h-3" />
                                <span>{weather.humidity}%</span>
                            </div>
                            <div className="flex items-center gap-1 justify-end">
                                <Wind className="w-3 h-3" />
                                <span>{weather.windSpeed} mph</span>
                            </div>
                        </div>
                    </div>

                    {/* Weather Alert */}
                    {weather.alerts && weather.alerts.length > 0 && (
                        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center gap-2 text-orange-700">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm font-medium">Weather Alert</span>
                            </div>
                            {weather.alerts.map((alert, i) => (
                                <p key={i} className="text-sm text-orange-600 mt-1">{alert}</p>
                            ))}
                        </div>
                    )}

                    {/* Scheduling Warning */}
                    {getSchedulingWarning() && (
                        <div className={`mb-4 p-3 rounded-lg ${getSchedulingWarning()?.type === 'warning'
                            ? 'bg-yellow-50 border border-yellow-200'
                            : 'bg-blue-50 border border-blue-200'
                            }`}>
                            <p className={`text-sm ${getSchedulingWarning()?.type === 'warning' ? 'text-yellow-700' : 'text-blue-700'
                                }`}>
                                {getSchedulingWarning()?.message}
                            </p>
                        </div>
                    )}

                    {/* 5-Day Forecast */}
                    {showForecast && forecast.length > 0 && (
                        <div className="border-t pt-4">
                            <p className="text-sm font-medium text-gray-700 mb-3">5-Day Forecast</p>
                            <div className="grid grid-cols-5 gap-2">
                                {forecast.map((day, i) => (
                                    <div key={i} className="text-center">
                                        <p className="text-xs text-gray-500">
                                            {i === 0 ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </p>
                                        <div className="my-2 flex justify-center">
                                            {getWeatherIcon(day.condition, 'w-6 h-6')}
                                        </div>
                                        <p className="text-sm font-medium">{day.high}°</p>
                                        <p className="text-xs text-gray-400">{day.low}°</p>
                                        {day.precipitation > 20 && (
                                            <p className="text-xs text-blue-500">{day.precipitation}%</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Last Updated */}
                    {lastUpdated && (
                        <p className="text-xs text-gray-400 text-center mt-4">
                            Updated {lastUpdated.toLocaleTimeString()}
                            {address && ` | ${address}`}
                            {userLoc && !location && (
                                <span className="inline-flex items-center gap-0.5 ml-1">
                                    <MapPinIcon className="w-3 h-3 inline" /> Your location
                                </span>
                            )}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
