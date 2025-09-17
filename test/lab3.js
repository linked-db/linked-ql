import '../src/lang/index.js';
import { Script } from '../src/lang/Script.js';

let sql = `
WITH RECURSIVE employee_hierarchy AS NOT MATERIALIZED (
  SELECT id, name, manager_id, 1 AS level
  FROM employees
  WHERE manager_id IS NULL
  
  UNION ALL
  
  SELECT e.id, e.name, e.manager_id, eh.level + 1
  FROM employees e
  JOIN employee_hierarchy eh ON e.manager_id = eh.id
  WHERE e.active IS TRUE
),
active_users AS (
  SELECT u.*, COUNT(*) OVER (PARTITION BY u.country) AS country_user_count
  FROM users u
  WHERE u.last_login > CURRENT_DATE - INTERVAL '30 days'
),
login_stats AS (
  SELECT user_id, COUNT(*) AS login_count, MAX(login_at) AS last_login
  FROM logins
  WHERE login_at > NOW() - INTERVAL '1 year'
  GROUP BY user_id
),
top_users AS (
  SELECT DISTINCT ON (u.country) u.id, u.name, u.country
  FROM active_users u
  ORDER BY u.country, u.last_login DESC
),
json_agg_data AS (
  SELECT user_id, jsonb_agg(to_jsonb(l)) AS logins_json
  FROM logins l
  GROUP BY user_id
),
array_users AS (
  SELECT ARRAY_AGG(id) AS user_ids
  FROM users
  WHERE email IS NOT NULL
)
SELECT 
  u.id,
  u.name,
  CASE 
    WHEN u.is_admin THEN 'admin'
    WHEN u.created_at < NOW() - INTERVAL '5 years' THEN 'veteran'
    ELSE 'regular'
  END AS user_tier,
  ls.login_count,
  ls.last_login,
  json_data.logins_json,
  e.level AS org_depth,
  COALESCE(p.profile_pic_url, 'default.jpg') AS profile_pic,
  EXISTS (
    SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.expires_at > NOW()
  ) AS is_banned,
  ALL (
    SELECT interest
    FROM user_interests ui
    WHERE ui.user_id = u.id
    ORDER BY interest
  ) AS interests,
  ROW_NUMBER() OVER (PARTITION BY u.country ORDER BY ls.login_count DESC) AS rank_in_country,
  (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id) AS total_purchases
FROM users u
LEFT JOIN login_stats ls ON ls.user_id = u.id
LEFT JOIN LATERAL (
  SELECT *
  FROM user_profiles p
  WHERE p.user_id = u.id
  LIMIT 1
) p ON true
LEFT JOIN json_agg_data json_data ON json_data.user_id = u.id
LEFT JOIN employee_hierarchy e ON e.id = u.employee_id
WHERE u.status IS DISTINCT FROM 'deleted'
  AND u.signup_source IN ('organic', 'referral', 'ad')
  AND u.id IN (SELECT unnest(array_users.user_ids) FROM array_users)
  AND u.email ~* '.*@example.com$'
  AND ARRAY (
    SELECT 1 FROM unsubscribe_requests WHERE user_id = u.id
  )
GROUP BY 
  u.id, u.name, u.is_admin, u.created_at, ls.login_count, ls.last_login, 
  json_data.logins_json, e.level, p.profile_pic_url
HAVING COUNT(*) FILTER (WHERE ls.login_count > 5) > 0
ORDER BY ls.login_count DESC NULLS LAST
LIMIT 100
OFFSET 20
FOR UPDATE SKIP LOCKED;

TABLE public.users *;
`;

let t1b;
t1b = await Script.parse(sql);

console.log('\n\n\n\nresultClassic:\n');
console.log(t1b?.stringify());

console.log('\n\n\n\nresultClassicJson:\n');
console.log(t1b?.jsonfy?.());