import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'LinkedQL',
    description: 'A modern take on SQL and SQL databases — with reactivity, versioning, and more.',
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
            { text: 'What is LinkedQL', link: '/overview', activeMatch: '/overview' },
            { text: 'Capabilities', link: '/capabilities', activeMatch: '/capabilities' },
            { text: 'Docs', link: '/docs', activeMatch: '/docs' },
            { text: 'FlashQL', link: '/flashql', activeMatch: '/flashql' },
            { text: 'Engineering', link: '/engineering/realtime-engine', activeMatch: '/engineering' },
            {
                text: 'Star on GitHub',
                link: 'https://github.com/linked-db/linked-ql',
            }
        ],

        // Sidebar per section (simple, explicit)
        sidebar: {
            '/': [
                {
                    text: 'Overview',
                    items: [
                        { text: 'What is LinkedQL', link: '/overview' },
                    ]
                },
                {
                    text: 'Docs',
                    items: [
                        { text: 'Getting Started', link: '/docs' },
                        { text: 'Dialects & Clients', link: '/docs/setup' },
                        { text: 'Query Interface', link: '/docs/query-api' },
                    ]
                },
                {
                    text: 'Capabilities',
                    items: [
                        { text: 'Capabilities Overview', link: '/capabilities' },
                        { text: 'Live Queries', link: '/capabilities/live-queries' },
                        { text: 'DeepRefs', link: '/capabilities/deeprefs' },
                        { text: 'JSON Literals', link: '/capabilities/json-literals' },
                        { text: 'UPSERT', link: '/capabilities/upsert' },
                    ]
                },
                {
                    text: 'FlashQL',
                    items: [
                        { text: 'FlashQL Overview', link: '/flashql' },
                        { text: 'Federation & Sync', link: '/flashql/foreign-io' },
                        { text: 'Language Reference', link: '/flashql/lang' },
                    ]
                },
                {
                    text: 'Engineering',
                    items: [
                        { text: 'Realtime Engine', link: '/engineering/realtime-engine' },
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
        search: { provider: 'local' },
    },

    // VitePress defaults are great; you can add head tags here if needed
    head: [['meta', { name: 'theme-color', content: 'gold' }]],

    lang: 'en-US',
    base: '/',
    cleanUrls: true,
    appearance: 'force-dark',
    toc: { level: [1, 2] },
    markdown: {
        math: true,
        theme: 'material-theme-palenight',
    },
})
