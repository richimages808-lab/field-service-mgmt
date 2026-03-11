import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Modern Neutral Palette (Slate)
                gray: colors.slate,

                // Premium Primary Palette (Deep Indigo/Violet mix)
                // Replacing 'blue' so existing components automatically upgrade
                blue: {
                    50: '#f0f3ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: '#6366f1', // Indigo-500
                    600: '#4f46e5', // Indigo-600 (Darker, richer)
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                    950: '#1e1b4b',
                },

                // Softer Success Color (Emerald)
                green: colors.emerald,

                // Softer Error Color (Rose)
                red: colors.rose,

                // Warmer Warning Color (Amber)
                yellow: colors.amber,
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
                'card': '0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)',
            }
        },
    },
    plugins: [],
}
