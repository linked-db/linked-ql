// src/example.mjs
import { FromEngine } from "./FromEngine.js";
import { QueryWindow } from "./QueryWindow.js";

/*
 Demo: NATURAL / USING normalization demo
*/

const tableSchemas = {
    users: ["id", "name", "active", "email"],
    posts: ["id", "user_id", "title", "content", "email"], // note `email` shared for NATURAL example
};

// Example 1: USING
const fromItems1 = [
    { nodeName: "FROM_ITEM", expr: { nodeName: "TABLE_REF", value: "users" }, alias: { value: "u" } }
];

const joinClauses1 = [
    {
        nodeName: "JOIN_CLAUSE",
        expr: { nodeName: "TABLE_REF", value: "posts" },
        alias: { value: "p" },
        join_type: "INNER",
        condition_clause: {
            nodeName: "USING_CLAUSE",
            column: [{ value: "id" }] // pretend using id (contrived)
        }
    }
];

const engine1 = new FromEngine({ fromItems: fromItems1, joinClauses: joinClauses1, tableSchemas });

const window1 = new QueryWindow({
    whereExpr: null,
    selectList: [
        { expr: { nodeName: "COLUMN_REF", qualifier: { nodeName: "TABLE_REF", value: "u" }, value: "name" }, alias: "username" },
        { expr: { nodeName: "COLUMN_REF", qualifier: { nodeName: "TABLE_REF", value: "p" }, value: "title" }, alias: "title" }
    ]
});

window1.attach(engine1);
window1.on("data", evt => console.log("[USING] Window event:", evt));

engine1.push("users", { rowId: "u1", rowObj: { id: 1, name: "Alice" } });
engine1.push("posts", { rowId: "p1", rowObj: { id: 1, user_id: 1, title: "Hello" } });

// Example 2: NATURAL JOIN
const fromItems2 = [
    { nodeName: "FROM_ITEM", expr: { nodeName: "TABLE_REF", value: "users" }, alias: { value: "u2" } }
];

const joinClauses2 = [
    {
        nodeName: "JOIN_CLAUSE",
        expr: { nodeName: "TABLE_REF", value: "posts" },
        alias: { value: "p2" },
        join_type: "INNER",
        natural_kw: true
    }
];

const engine2 = new FromEngine({ fromItems: fromItems2, joinClauses: joinClauses2, tableSchemas });
const window2 = new QueryWindow({
    selectList: [
        { expr: { nodeName: "COLUMN_REF", qualifier: { nodeName: "TABLE_REF", value: "u2" }, value: "name" }, alias: "username" },
        { expr: { nodeName: "COLUMN_REF", qualifier: { nodeName: "TABLE_REF", value: "p2" }, value: "title" }, alias: "title" }
    ]
});
window2.attach(engine2);
window2.on("data", evt => console.log("[NATURAL] Window event:", evt));

engine2.push("users", { rowId: "u2-1", rowObj: { id: 1, name: "Bob", email: "b@example.com" } });
engine2.push("posts", { rowId: "p2-1", rowObj: { id: 2, user_id: 1, title: "Post", email: "b@example.com" } });
