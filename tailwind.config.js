/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
                display: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                zinc: {
                    850: '#1f1f22',
                    900: '#18181b', // Default Dark Bg
                    950: '#09090b', // Deep Dark
                },
                brand: {
                    50: '#fff1f2',
                    100: '#ffe4e6',
                    200: '#fecdd3',
                    300: '#fda4af',
                    400: '#fb7185',
                    500: '#f43f5e', // Rose 500 (Highlights)
                    600: '#e11d48', // Rose 600 (Primary Action)
                    700: '#be123c', // Deep Rose (Text)
                    800: '#9f1239', // Dark Rose
                    900: '#881337',
                    950: '#4c0519',
                },
                // Add specific dark mode background/surface colors if needed, 
                // but usually we use zinc-900/950.
            },
            typography: (theme) => ({
                DEFAULT: {
                    css: {
                        color: theme('colors.zinc.600'),
                        a: {
                            color: theme('colors.brand.600'),
                            '&:hover': {
                                color: theme('colors.brand.700'),
                            },
                        },
                        'h1,h2,h3,h4': {
                            color: theme('colors.zinc.900'),
                            fontWeight: '700',
                            letterSpacing: '-0.025em', // Tighter tracking for modern look
                        },
                        code: {
                            color: theme('colors.rose.600'),
                            backgroundColor: theme('colors.zinc.100'),
                            paddingLeft: '6px',
                            paddingRight: '6px',
                            paddingTop: '3px',
                            paddingBottom: '3px',
                            borderRadius: '0.375rem',
                            fontWeight: '600',
                        },
                        'code::before': { content: '""' },
                        'code::after': { content: '""' },
                        blockquote: {
                            borderLeftColor: theme('colors.brand.500'),
                            backgroundColor: theme('colors.brand.50'),
                            color: theme('colors.zinc.700'),
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            fontStyle: 'normal',
                            quotes: 'none',
                        },
                    },
                },
                dark: {
                    css: {
                        color: theme('colors.zinc.400'), // Much softer than white
                        a: {
                            color: theme('colors.brand.400'), // Pastel rose for dark mode
                            '&:hover': {
                                color: theme('colors.brand.300'),
                            },
                        },
                        'h1,h2,h3,h4': {
                            color: theme('colors.zinc.100'), // Use white only for headings
                        },
                        code: {
                            color: theme('colors.rose.300'),
                            backgroundColor: 'rgba(255,255,255, 0.05)', // Glassmorphism style
                        },
                        blockquote: {
                            borderLeftColor: theme('colors.brand.500'),
                            backgroundColor: 'rgba(225,29,72, 0.1)', // Subtle brand tint
                            color: theme('colors.zinc.300'),
                        },
                    },
                },
            }),
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
