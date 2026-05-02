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
            { text: 'Guides', link: '/guides/', activeMatch: '/guides' },
            { text: 'API', link: '/api/', activeMatch: '/api' },
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
                    text: 'Core Guides',
                    items: [
                        { text: 'Getting Started', link: '/guides' },
                        { text: 'PostgreSQL', link: '/guides/postgresql' },
                        { text: 'MySQL', link: '/guides/mysql' },
                        { text: 'MariaDB', link: '/guides/mariadb' },
                        { text: 'FlashQL', link: '/guides/flashql' },
                        { text: 'Edge', link: '/guides/edge' },
                        { text: 'Integration Patterns', link: '/guides/integration-patterns' },
                    ]
                },
                {
                    text: 'API',
                    items: [
                        { text: 'API Overview', link: '/api' },
                        { text: 'db.query()', link: '/api/query' },
                        { text: 'db.stream()', link: '/api/stream' },
                        { text: 'db.transaction()', link: '/api/transaction' },
                        { text: 'db.wal.subscribe()', link: '/api/wal-subscribe' },
                    ]
                },
                {
                    text: 'Language Surface',
                    items: [
                        { text: 'Language Overview', link: '/lang' },
                        { text: 'DeepRefs', link: '/lang/deeprefs' },
                        { text: 'JSON Literals', link: '/lang/json-literals' },
                        { text: 'UPSERT', link: '/lang/upsert' },
                        { text: 'Version Binding', link: '/lang/version-binding' },
                    ]
                },
                {
                    text: 'Realtime Capabilities',
                    items: [
                        { text: 'Realtime Overview', link: '/realtime' },
                        { text: 'Live Queries', link: '/realtime/live-queries' },
                        { text: 'Changefeeds', link: '/realtime/changefeeds' },
                    ]
                },
                {
                    text: 'FlashQL',
                    items: [
                        { text: 'FlashQL Overview', link: '/flashql' },
                        { text: 'Federation, Materialization, & Sync', link: '/flashql/federation-and-sync' },
                        { text: 'Conflict Model', link: '/flashql/conflict-model' },
                        { text: 'The Sync API', link: '/flashql/sync-api' },
                        { text: 'Language Reference', link: '/flashql/lang' },
                    ]
                },
                {
                    text: 'Engineering',
                    items: [
                        { text: 'The Realtime Engine', link: '/engineering/realtime-engine' },
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
