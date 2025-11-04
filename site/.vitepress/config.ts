import { defineConfig } from 'vitepress'

export default defineConfig({
    lang: 'en-US',
    title: 'LinkedQL',
    description: 'A modern take on SQL and SQL databases — with reactivity, versioning, and more.',
    appearance: 'force-dark',
    base: '/',
    cleanUrls: true,
    themeConfig: {
        // Site logo
        logo: {
            src: '/img/brand/linked-ql-logo.png',
            height: 140
        },
        siteTitle: false,
        socialLinks: [
            //{ icon: 'discord', link: 'https://discord.electric-sql.com' },
            { icon: 'github', link: 'https://github.com/linked-db/linked-ql' },
        ],
        // Top nav
        nav: [
            { text: 'About', link: '/docs/about' },
            { text: 'Capabilities', link: '/docs/capabilities' },
            { text: 'FlashQL', link: '/docs/flashql' },
            { text: 'Docs', link: '/docs' },
            {
                text: 'Star on GitHub',
                link: 'https://github.com/linked-db/linked-ql',
            }
        ],

        // Sidebar per section (simple, explicit)
        sidebar: {
            '/': [
                {
                    text: 'Intro',
                    items: [
                        { text: 'About', link: '/docs/about' },
                    ]
                },
                {
                    text: 'Docs',
                    items: [
                        { text: 'Getting Started', link: '/docs' },
                        { text: 'Dialects & Clients', link: '/docs/setup' },
                        { text: 'Query Interface', link: '/docs/query-api' },
                        {
                            text: 'Capabilities',
                            link: '/docs/capabilities',
                            items: [
                                { text: 'DeepRefs', link: '/docs/capabilities/deeprefs' },
                                { text: 'JSON Literals', link: '/docs/capabilities/json-literals' },
                                { text: 'UPSERT', link: '/docs/capabilities/upsert' },
                                { text: 'Realtime SQL', link: '/docs/capabilities/realtime-sql' },
                            ]
                        },
                    ]
                },
                {
                    text: 'FlashQL',
                    items: [
                        { text: 'FlashQL', link: '/docs/flashql' },
                    ]
                }
            ]
        },

        // Useful footer
        footer: {
            message: 'MIT Licensed',
            copyright: '© Oxford Harrison'
        },

        // Search: VitePress ships built-in local search
        search: {
            provider: 'local'
        },

        // Appearance (dark mode)
        appearance: 'auto' // auto | dark | light
    },

    // VitePress defaults are great; you can add head tags here if needed
    head: [
        ['meta', { name: 'theme-color', content: '#0f172a' }]
    ]
})
