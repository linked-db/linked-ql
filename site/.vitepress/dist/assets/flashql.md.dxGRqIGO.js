import{_ as a,c as n,o as l,ag as e}from"./chunks/framework.B-XtCDNB.js";const d=JSON.parse('{"title":"FlashQL","description":"","frontmatter":{},"headers":[],"relativePath":"flashql.md","filePath":"flashql.md"}'),p={name:"flashql.md"};function o(t,s,r,c,i,y){return l(),n("div",null,[...s[0]||(s[0]=[e(`<h1 id="flashql" tabindex="-1">FlashQL <a class="header-anchor" href="#flashql" aria-label="Permalink to &quot;FlashQL&quot;">​</a></h1><p><em>A full SQL engine for the local runtime, the edge, and the offline world.</em></p><p>FlashQL is LinkedQL’s embeddable database engine — a complete in-memory SQL runtime that runs anywhere JavaScript does: Node.js, browser, worker, or edge.</p><p>FlashQL can replace SQLite or PGLite across a variety of use cases — offering standard SQL semantics combined with LinkedQL’s extended capabilities, and native support for federation and synchronization.</p><p>Use FlashQL to:</p><ul><li>Run full SQL queries over arbitrary datasets — even runtime data.</li><li>Run <em>Live Queries</em> for analytics dashboards, collaborative applications, live feeds, etc.</li><li>Federate across local and remote databases.</li><li>Materialize datasets for offline access.</li><li>Synchronize bidirectionally with arbitrary remote sources.</li></ul><h2 id="overview" tabindex="-1">Overview <a class="header-anchor" href="#overview" aria-label="Permalink to &quot;Overview&quot;">​</a></h2><p>Modern applications need database power without a network layer or the overhead of a physical database server. Sometimes, they also need both — a hybrid model that pairs traditional databases with a local engine. FlashQL addresses just that <strong>in less than <code>80KiB min|zip</code></strong>.</p><p>Just spin up an instance in-app and run SQL:</p><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#89DDFF;font-style:italic;">import</span><span style="color:#89DDFF;"> {</span><span style="color:#BABED8;"> FlashQL</span><span style="color:#89DDFF;"> }</span><span style="color:#89DDFF;font-style:italic;"> from</span><span style="color:#89DDFF;"> &#39;</span><span style="color:#C3E88D;">@linked-db/linked-ql/flash</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C792EA;">const</span><span style="color:#BABED8;"> db </span><span style="color:#89DDFF;">=</span><span style="color:#89DDFF;"> new</span><span style="color:#82AAFF;"> FlashQL</span><span style="color:#BABED8;">()</span><span style="color:#89DDFF;">;</span></span>
<span class="line"><span style="color:#89DDFF;font-style:italic;">await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">connect</span><span style="color:#BABED8;">()</span><span style="color:#89DDFF;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C792EA;">const</span><span style="color:#BABED8;"> result </span><span style="color:#89DDFF;">=</span><span style="color:#89DDFF;font-style:italic;"> await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">query</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">&#39;</span><span style="color:#C3E88D;">SELECT 2::text AS value</span><span style="color:#89DDFF;">&#39;</span><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span>
<span class="line"><span style="color:#BABED8;">console</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">log</span><span style="color:#BABED8;">(result</span><span style="color:#89DDFF;">.</span><span style="color:#BABED8;">rows)</span><span style="color:#89DDFF;">;</span><span style="color:#676E95;font-style:italic;"> // [{ value: &#39;2&#39; }]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#89DDFF;font-style:italic;">await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">disconnect</span><span style="color:#BABED8;">()</span><span style="color:#89DDFF;">;</span></span></code></pre></div><p>From here, you get a robust query engine that can query just as fine from arbtrary data sources as from the local store — a defining feature of <strong>FlashQL</strong>. Meet the FlashQL <strong>Universal I/O</strong> model.</p><h2 id="dialects" tabindex="-1">Dialects <a class="header-anchor" href="#dialects" aria-label="Permalink to &quot;Dialects&quot;">​</a></h2><p>FlashQL supports both <strong>PostgreSQL</strong> and <strong>MySQL</strong> dialects.</p><p>Set globally:</p><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#C792EA;">const</span><span style="color:#BABED8;"> db </span><span style="color:#89DDFF;">=</span><span style="color:#89DDFF;"> new</span><span style="color:#82AAFF;"> FlashQL</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">{</span><span style="color:#F07178;"> dialect</span><span style="color:#89DDFF;">:</span><span style="color:#89DDFF;"> &#39;</span><span style="color:#C3E88D;">postgres</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;"> }</span><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span></code></pre></div><p>Optionally specify per query:</p><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#89DDFF;font-style:italic;">await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">query</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">&#39;</span><span style="color:#C3E88D;">SELECT \`name\` FROM \`users\`</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;">,</span><span style="color:#89DDFF;"> {</span><span style="color:#F07178;"> dialect</span><span style="color:#89DDFF;">:</span><span style="color:#89DDFF;"> &#39;</span><span style="color:#C3E88D;">mysql</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;"> }</span><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span></code></pre></div><p>Where not specified at any scope, FlashQL&#39;s dialect defaults to <code>postgres</code>.</p><h2 id="compatibility" tabindex="-1">Compatibility <a class="header-anchor" href="#compatibility" aria-label="Permalink to &quot;Compatibility&quot;">​</a></h2><p>FlashQL speaks real SQL — in native dialects, but isn&#39;t a full clone of PostgreSQL or MySQL. The goal isn’t to reproduce the entire database engine surface, but to cover the full scope of application-level SQL — streamlined to the declarative and structural features actually used in code: queries, mutations, definitions, and expressions.</p><p>You&#39;d find FlashQL&#39;s implementation coverage of SQL in the <a href="/flashql/lang">Language Reference</a>. (Treat as a live reference.)</p><p>To give a <strong>general</strong> sense of FlashQL’s SQL feature coverage, here are two advanced example queries using PostgreSQL-specific syntax.</p><hr><details><summary>Query 1: (click to show)</summary><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#C792EA;">const</span><span style="color:#89DDFF;"> {</span><span style="color:#BABED8;"> rows </span><span style="color:#89DDFF;">}</span><span style="color:#89DDFF;"> =</span><span style="color:#89DDFF;font-style:italic;"> await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">query</span><span style="color:#BABED8;">(</span></span>
<span class="line"><span style="color:#89DDFF;">    \`</span><span style="color:#C3E88D;">WITH</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 1️⃣  Writable CTE: mutate + return</span></span>
<span class="line"><span style="color:#C3E88D;">        updated AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            UPDATE users</span></span>
<span class="line"><span style="color:#C3E88D;">            SET status = &#39;inactive&#39;</span></span>
<span class="line"><span style="color:#C3E88D;">            WHERE last_login &lt; NOW() - INTERVAL &#39;90 days&#39;</span></span>
<span class="line"><span style="color:#C3E88D;">            RETURNING id, name, department, last_login</span></span>
<span class="line"><span style="color:#C3E88D;">        ),</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 2️⃣  Derived metrics using LATERAL subquery</span></span>
<span class="line"><span style="color:#C3E88D;">        metrics AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">            u.id,</span></span>
<span class="line"><span style="color:#C3E88D;">            u.name,</span></span>
<span class="line"><span style="color:#C3E88D;">            u.department,</span></span>
<span class="line"><span style="color:#C3E88D;">            m.avg_total,</span></span>
<span class="line"><span style="color:#C3E88D;">            m.order_rank</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM updated u</span></span>
<span class="line"><span style="color:#C3E88D;">            LEFT JOIN LATERAL (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">                AVG(total) AS avg_total,</span></span>
<span class="line"><span style="color:#C3E88D;">                RANK() OVER (ORDER BY SUM(total) DESC) AS order_rank</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM orders o</span></span>
<span class="line"><span style="color:#C3E88D;">            WHERE o.user_id = u.id</span></span>
<span class="line"><span style="color:#C3E88D;">            GROUP BY o.user_id</span></span>
<span class="line"><span style="color:#C3E88D;">            ) m ON TRUE</span></span>
<span class="line"><span style="color:#C3E88D;">        ),</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 3️⃣  Aggregate by department with ROLLUP + CUBE</span></span>
<span class="line"><span style="color:#C3E88D;">        aggregates AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">            department,</span></span>
<span class="line"><span style="color:#C3E88D;">            COUNT(*) AS user_count,</span></span>
<span class="line"><span style="color:#C3E88D;">            ROUND(AVG(avg_total),2) AS avg_order_total,</span></span>
<span class="line"><span style="color:#C3E88D;">            GROUPING(department) AS dept_grouped</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM metrics</span></span>
<span class="line"><span style="color:#C3E88D;">            GROUP BY CUBE (department)</span></span>
<span class="line"><span style="color:#C3E88D;">        )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">    -- 4️⃣  Combine results and compute analytics</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">    a.department,</span></span>
<span class="line"><span style="color:#C3E88D;">    a.user_count,</span></span>
<span class="line"><span style="color:#C3E88D;">    a.avg_order_total,</span></span>
<span class="line"><span style="color:#C3E88D;">    SUM(a.user_count) OVER () AS total_users,</span></span>
<span class="line"><span style="color:#C3E88D;">    RANK() OVER (ORDER BY a.avg_order_total DESC NULLS LAST) AS perf_rank</span></span>
<span class="line"><span style="color:#C3E88D;">    FROM aggregates a</span></span>
<span class="line"><span style="color:#C3E88D;">    ORDER BY a.department NULLS LAST</span><span style="color:#89DDFF;">\`</span></span>
<span class="line"><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#BABED8;">console</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">log</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">&#39;</span><span style="color:#C3E88D;">Result:</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;">,</span><span style="color:#BABED8;"> rows)</span><span style="color:#89DDFF;">;</span></span></code></pre></div></details><p>Capabilities demonstrated:</p><ul><li>CTEs (<code>WITH</code>)</li><li>writable CTE (<code>UPDATE…RETURNING</code>)</li><li><code>JOIN LATERAL</code></li><li>aggregate and window functions (<code>AVG</code>, <code>RANK</code>, <code>SUM OVER()</code>)</li><li>analytic grouping (<code>CUBE</code>, <code>GROUPING()</code>)</li><li>expression logic</li></ul><hr><details><summary>Query 2: (click to show)</summary><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#C792EA;">const</span><span style="color:#89DDFF;"> {</span><span style="color:#BABED8;"> rows </span><span style="color:#89DDFF;">}</span><span style="color:#89DDFF;"> =</span><span style="color:#89DDFF;font-style:italic;"> await</span><span style="color:#BABED8;"> db</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">query</span><span style="color:#BABED8;">(</span></span>
<span class="line"><span style="color:#89DDFF;">    \`</span><span style="color:#C3E88D;">WITH</span></span>
<span class="line"><span style="color:#C3E88D;">        --  Inline VALUES table</span></span>
<span class="line"><span style="color:#C3E88D;">        recent_logins AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT *</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM (VALUES</span></span>
<span class="line"><span style="color:#C3E88D;">            (1, &#39;2025-10-01&#39;::date),</span></span>
<span class="line"><span style="color:#C3E88D;">            (2, &#39;2025-10-15&#39;::date),</span></span>
<span class="line"><span style="color:#C3E88D;">            (3, &#39;2025-10-20&#39;::date)</span></span>
<span class="line"><span style="color:#C3E88D;">            ) AS t(user_id, last_login)</span></span>
<span class="line"><span style="color:#C3E88D;">        ),</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 2️⃣  Combine multiple function outputs with ROWS FROM</span></span>
<span class="line"><span style="color:#C3E88D;">        generated AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT *</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM ROWS FROM (</span></span>
<span class="line"><span style="color:#C3E88D;">            generate_series(1, 3) AS gen_id,</span></span>
<span class="line"><span style="color:#C3E88D;">            unnest(ARRAY[&#39;A&#39;, &#39;B&#39;, &#39;C&#39;]) AS label</span></span>
<span class="line"><span style="color:#C3E88D;">            )</span></span>
<span class="line"><span style="color:#C3E88D;">        ),</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 3️⃣  Join VALUES + ROWS FROM + base table</span></span>
<span class="line"><span style="color:#C3E88D;">        enriched AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">                u.id,</span></span>
<span class="line"><span style="color:#C3E88D;">                u.name,</span></span>
<span class="line"><span style="color:#C3E88D;">                r.last_login,</span></span>
<span class="line"><span style="color:#C3E88D;">                g.label,</span></span>
<span class="line"><span style="color:#C3E88D;">                COALESCE(o.total, 0) AS total_spent</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM users u</span></span>
<span class="line"><span style="color:#C3E88D;">            JOIN recent_logins r ON r.user_id = u.id</span></span>
<span class="line"><span style="color:#C3E88D;">            JOIN generated g ON g.gen_id = u.id</span></span>
<span class="line"><span style="color:#C3E88D;">            LEFT JOIN (VALUES </span></span>
<span class="line"><span style="color:#C3E88D;">                (1, 1200), </span></span>
<span class="line"><span style="color:#C3E88D;">                (2, 500), </span></span>
<span class="line"><span style="color:#C3E88D;">                (3, 900)</span></span>
<span class="line"><span style="color:#C3E88D;">            ) AS o(user_id, total) ON o.user_id = u.id</span></span>
<span class="line"><span style="color:#C3E88D;">        ),</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">        -- 4️⃣  Aggregate and group with GROUPING SETS</span></span>
<span class="line"><span style="color:#C3E88D;">        grouped AS (</span></span>
<span class="line"><span style="color:#C3E88D;">            SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">                label,</span></span>
<span class="line"><span style="color:#C3E88D;">                DATE_TRUNC(&#39;month&#39;, last_login) AS login_month,</span></span>
<span class="line"><span style="color:#C3E88D;">                COUNT(*) AS active_users,</span></span>
<span class="line"><span style="color:#C3E88D;">                SUM(total_spent) AS revenue</span></span>
<span class="line"><span style="color:#C3E88D;">            FROM enriched</span></span>
<span class="line"><span style="color:#C3E88D;">            GROUP BY GROUPING SETS (</span></span>
<span class="line"><span style="color:#C3E88D;">                (label, login_month),</span></span>
<span class="line"><span style="color:#C3E88D;">                (label),</span></span>
<span class="line"><span style="color:#C3E88D;">                ()</span></span>
<span class="line"><span style="color:#C3E88D;">            )</span></span>
<span class="line"><span style="color:#C3E88D;">        )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C3E88D;">    -- 5️⃣  Combine with another set using UNION / INTERSECT / EXCEPT</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT * FROM grouped</span></span>
<span class="line"><span style="color:#C3E88D;">    UNION ALL</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">        label, </span></span>
<span class="line"><span style="color:#C3E88D;">        NULL AS login_month, </span></span>
<span class="line"><span style="color:#C3E88D;">        0 AS active_users, </span></span>
<span class="line"><span style="color:#C3E88D;">        0 AS revenue</span></span>
<span class="line"><span style="color:#C3E88D;">    FROM generated</span></span>
<span class="line"><span style="color:#C3E88D;">    EXCEPT</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">        label, </span></span>
<span class="line"><span style="color:#C3E88D;">        NULL, </span></span>
<span class="line"><span style="color:#C3E88D;">        0, </span></span>
<span class="line"><span style="color:#C3E88D;">        0</span></span>
<span class="line"><span style="color:#C3E88D;">    FROM grouped</span></span>
<span class="line"><span style="color:#C3E88D;">    INTERSECT</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT </span></span>
<span class="line"><span style="color:#C3E88D;">        label, </span></span>
<span class="line"><span style="color:#C3E88D;">        NULL, </span></span>
<span class="line"><span style="color:#C3E88D;">        0, </span></span>
<span class="line"><span style="color:#C3E88D;">        0</span></span>
<span class="line"><span style="color:#C3E88D;">    FROM grouped</span></span>
<span class="line"><span style="color:#C3E88D;">    ORDER BY label NULLS LAST</span><span style="color:#89DDFF;">\`</span></span>
<span class="line"><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#BABED8;">console</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">log</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">&#39;</span><span style="color:#C3E88D;">Result:</span><span style="color:#89DDFF;">&#39;</span><span style="color:#89DDFF;">,</span><span style="color:#BABED8;"> rows)</span><span style="color:#89DDFF;">;</span></span></code></pre></div></details><p>Capabilities demonstrated:</p><ul><li>Inline <code>VALUES</code> tables</li><li><code>ROWS FROM</code> with multiple functions</li><li>Combined <code>JOIN</code>s on derived tables</li><li><code>COALESCE</code> and <code>DATE_TRUNC</code> expressions</li><li><code>GROUPING SETS</code> multi-level aggregation</li><li>Chained set operations (<code>UNION ALL … EXCEPT … INTERSECT</code>)</li><li>Set Returning Functions (SRF) <code>UNNEST()</code>, <code>GENERATE_SERIES()</code></li><li>Ordering with <code>NULLS LAST</code></li></ul><h2 id="storage-backends" tabindex="-1">Storage Backends <a class="header-anchor" href="#storage-backends" aria-label="Permalink to &quot;Storage Backends&quot;">​</a></h2><p>FlashQL’s in-memory engine is volatile by default. To persist or share state, plug in an alternate backend.</p><ul><li><strong>In-Memory (default)</strong> — ephemeral, ultra-fast.</li><li><strong>IndexedDB (browser, planned)</strong> — persistent storage for the web.</li><li><strong>Redis (planned)</strong> — shared network memory.</li><li><strong>Custom (planned)</strong> — plug-in adapter.</li></ul><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#C792EA;">const</span><span style="color:#BABED8;"> db </span><span style="color:#89DDFF;">=</span><span style="color:#89DDFF;"> new</span><span style="color:#82AAFF;"> FlashQL</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">{</span></span>
<span class="line"><span style="color:#F07178;">  storage</span><span style="color:#89DDFF;">:</span><span style="color:#89DDFF;"> new</span><span style="color:#82AAFF;"> MyAdapter</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">{</span></span>
<span class="line"><span style="color:#82AAFF;">    onLoad</span><span style="color:#89DDFF;">:</span><span style="color:#C792EA;"> async</span><span style="color:#89DDFF;"> ()</span><span style="color:#C792EA;"> =&gt;</span><span style="color:#89DDFF;"> {</span><span style="color:#676E95;font-style:italic;"> /* load from disk */</span><span style="color:#89DDFF;"> },</span></span>
<span class="line"><span style="color:#82AAFF;">    onFlush</span><span style="color:#89DDFF;">:</span><span style="color:#C792EA;"> async</span><span style="color:#89DDFF;"> (</span><span style="color:#BABED8;font-style:italic;">data</span><span style="color:#89DDFF;">)</span><span style="color:#C792EA;"> =&gt;</span><span style="color:#89DDFF;"> {</span><span style="color:#676E95;font-style:italic;"> /* write to disk */</span><span style="color:#89DDFF;"> },</span></span>
<span class="line"><span style="color:#89DDFF;">  }</span><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">,</span></span>
<span class="line"><span style="color:#89DDFF;">}</span><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span></code></pre></div><h2 id="linkedql-capabilities" tabindex="-1">LinkedQL Capabilities <a class="header-anchor" href="#linkedql-capabilities" aria-label="Permalink to &quot;LinkedQL Capabilities&quot;">​</a></h2><p>FlashQL shares the same core as the rest of LinkedQL, bringing its advanced language and runtime capabilities to the local runtime. This core includes:</p><table tabindex="0"><thead><tr><th style="text-align:left;">Language Capabilities</th><th style="text-align:left;">Runtime Capabilities</th></tr></thead><tbody><tr><td style="text-align:left;"><strong><a href="/capabilities/deeprefs">DeepRefs</a></strong></td><td style="text-align:left;"><strong><a href="/capabilities/live-queries">Live Queries</a></strong></td></tr><tr><td style="text-align:left;"><strong><a href="/capabilities/json-literals">JSON Literals</a></strong></td><td style="text-align:left;"></td></tr><tr><td style="text-align:left;"><strong><a href="/capabilities/upsert">UPSERT</a></strong></td><td style="text-align:left;"></td></tr></tbody></table><div class="language-js"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki material-theme-palenight vp-code" tabindex="0"><code><span class="line"><span style="color:#C792EA;">const</span><span style="color:#BABED8;"> result </span><span style="color:#89DDFF;">=</span><span style="color:#89DDFF;font-style:italic;"> await</span><span style="color:#BABED8;"> client</span><span style="color:#89DDFF;">.</span><span style="color:#82AAFF;">query</span><span style="color:#BABED8;">(</span><span style="color:#89DDFF;">\`</span></span>
<span class="line"><span style="color:#C3E88D;">    SELECT title, author ~&gt; name FROM posts</span></span>
<span class="line"><span style="color:#89DDFF;">\`</span><span style="color:#89DDFF;">,</span><span style="color:#89DDFF;"> {</span><span style="color:#F07178;"> live</span><span style="color:#89DDFF;">:</span><span style="color:#FF9CAC;"> true</span><span style="color:#89DDFF;"> }</span></span>
<span class="line"><span style="color:#BABED8;">)</span><span style="color:#89DDFF;">;</span></span></code></pre></div><h2 id="universal-i-o" tabindex="-1">Universal I/O <a class="header-anchor" href="#universal-i-o" aria-label="Permalink to &quot;Universal I/O&quot;">​</a></h2><p>Beyond just a local database, FlashQL is built as a <strong>unified SQL interface</strong> over your entire data universe — wherever that may span. The query engine follows a model that lets you bring <strong>arbitrary data</strong> into a single relational query space — whether from the local runtime, a remote database, a REST API, or any other source. Your application sees a unified abstraction — a query space — while the specific details of these sources remain isolated to the wiring layer.</p><p>FlashQL exposes these capabilities through <strong>Foreign I/O</strong> — a family of interfaces that let you:</p><ul><li><strong>Federate</strong> — write queries that span multiple data origins on the fly.</li><li><strong>Materialize</strong> — stage remote data locally for edge or offline execution.</li><li><strong>Synchronize</strong> — maintain bidirectional sync between local and remote states.</li></ul><p>These are covered in the <a href="./flashql/foreign-io">Foreign I/O</a> reference.</p><h2 id="configuration-extensibility" tabindex="-1">Configuration &amp; Extensibility <a class="header-anchor" href="#configuration-extensibility" aria-label="Permalink to &quot;Configuration &amp; Extensibility&quot;">​</a></h2><p>FlashQL exposes a minimal configuration surface for adapting its behavior.</p><table tabindex="0"><thead><tr><th style="text-align:left;">Hook</th><th style="text-align:left;">Purpose</th></tr></thead><tbody><tr><td style="text-align:left;"><code>dialect</code></td><td style="text-align:left;">Specify default dialect</td></tr><tr><td style="text-align:left;"><code>onCreateRemoteClient</code></td><td style="text-align:left;">Define how remote connections are created</td></tr><tr><td style="text-align:left;"><code>storage</code> (<em>planned</em>)</td><td style="text-align:left;">Customize persistence layer</td></tr><tr><td style="text-align:left;"><code>functions</code> (<em>planned</em>)</td><td style="text-align:left;">Register user-defined SQL functions</td></tr><tr><td style="text-align:left;"><code>hooks</code> (<em>planned</em>)</td><td style="text-align:left;">Integrate orchestration or logging</td></tr></tbody></table>`,46)])])}const F=a(p,[["render",o]]);export{d as __pageData,F as default};
