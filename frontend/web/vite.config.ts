import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
                    maps: ['leaflet', 'react-leaflet'],
                    ui: ['lucide-react', 'date-fns', 'react-big-calendar', 'react-datepicker', 'recharts']
                }
            }
        }
    }
})
