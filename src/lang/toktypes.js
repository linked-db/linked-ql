/**
 * Token types:
 * Noted that some delims and modifiers are dialect-dependent, and those are correctly handle by the tokenizer.
  * Note too that emitted tokens may have a "spaceBefore" field when options.spaces === true.
  * Lastly, "line" and "column" fields are guaranteed to be emitted by the tokenizer.
 */
export const TOK_TYPES = {
  // Data type names
  // e.g. VARCHAR, INT, "custom_type"
  data_type: {
    type: 'data_type',
    value: undefined,
    resolve() { return this; }
  },
  // Identifiers, optionally delimited
  // e.g. user_id, "UserName", `table$1`
  identifier: {
    type: 'identifier',
    value: undefined,
    delim: [undefined],
    resolve({ dialect, mysqlAnsiQuotes } = {}) {
      return {
        ...this,
        delim: this.delim.concat(
          dialect === 'mysql' ? (mysqlAnsiQuotes ? ['"', '`'] : ['`']) : ['"']
        ),
      };
    }
  },
  // Any of the predefined keywords
  // e.g. 'SELECT', 'FROM', 'WHERE'
  keyword: {
    type: 'keyword',
    value: undefined,
    resolve() { return this; }
  },
  // Operators, with precedence and associativity
  // e.g. '+', '-', '||', 'AND', '::'
  operator: {
    type: 'operator',
    value: undefined,
    prec: undefined, // number
    assoc: undefined, // string
    resolve() { return this; }
  },
  // Punctuation (., ,, :, ;, etc.)
  // e.g. '.', ',', ':', ';', '(', ')'
  punctuation: {
    type: 'punctuation',
    value: undefined,
    resolve() { return this; }
  },
  // String literals, with required delim and optional modifier (e.g. E for Postgres, N for mysql)
  // e.g. 'Hello', "World", $$foo$$, $tag$bar$tag$
  string_literal: {
    type: 'string_literal',
    value: undefined,
    delim: ["'"],
    modifier: [undefined],
    resolve({ dialect, mysqlAnsiQuotes } = {}) {
      return {
        ...this,
        delim: this.delim.concat(
          dialect === 'mysql' ? (!mysqlAnsiQuotes ? ['"'] : []) : [/^(\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$)$/]
        ),
        modifier: this.modifier.concat(
          dialect === 'mysql' ? ['N'] : ['E']
        ),
      };
    }
  },
  // Numbers (integer, float, exponential, etc.)
  // e.g. 42, -3.14, 2e10, .004
  number_literal: {
    type: 'number_literal',
    value: undefined,
    match({ value }) {
      // Match type "number_literal": 42, 3.14, .5, 5., 1e9, -2.7E-3, +0.001e+2
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return false;
      return true;
    }
  },
  // NULL Literal: NULL
  null_literal: {
    type: 'null_literal',
    value: undefined,
    resolve() { return this; }
  },
  // UNKNOWN Literal: NULL
  unknown_literal: {
    type: 'unknown_literal',
    value: undefined,
    resolve() { return this; }
  },
  // Bool Literals: TRUE | FALSE
  bool_literal: {
    type: 'bool_literal',
    value: undefined,
    resolve() { return this; }
  },
  // HEX Literals: 0xFF | X'FF'
  hex_literal: {
    type: 'hex_literal',
    value: undefined,
    resolve() { return this; }
  },
  // BIT Literals: 0b0101 | B'0101'
  bit_literal: {
    type: 'bit_literal',
    value: undefined,
    resolve() { return this; }
  },
  // Bindings (e.g. $1, ?, etc.), with required delim
  // e.g. $1, $user, ?
  bind_var: {
    type: 'bind_var',
    value: undefined,
    delim: [],
    resolve({ dialect } = {}) {
      return {
        ...this,
        delim: this.delim.concat(dialect === 'mysql' ? ['?'] : ['$'])
      };
    }
  },
  // Version tags
  // e.g. my_db@1_3, my_db@^2_1, my_db@~7_6, my_db @=3_4, my_db@<3, my_db@>4, my_db@<=3, my_db@>=4
  version_spec: {
    type: 'version_spec',
    value: undefined,
    delim: [undefined, "'"],
    resolve() { return this; }
  },
  // User variables, with optional delim
  // e.g. :foo, @bar, @'user var'
  user_var: {
    type: 'user_var',
    value: undefined,
    delim: [undefined],
    resolve({ dialect } = {}) {
      return {
        ...this,
        delim: this.delim.concat(dialect === 'mysql' ? ["'"] : [])
      };
    }
  },
  // MySQL system variables, with required notation
  // e.g. @@baz
  system_var: {
    type: 'system_var',
    value: undefined,
    resolve() { return this; }
  },
  // Nest token type: "brace"
  brace_block: {
    type: 'brace_block',
    value: undefined, // TokenStream
    resolve() { return this; }
  },
  // Nest token type: "bracket"
  bracket_block: {
    type: 'bracket_block',
    value: undefined, // TokenStream
    resolve() { return this; }
  },
  // Nest token type: "paren"
  parent_block: {
    type: 'paren_block',
    value: undefined, // TokenStream
    resolve() { return this; }
  },
  // Block comments
  // e.g. /* This is a comment */
  block_comment: {
    type: 'block_comment',
    value: undefined,
    resolve() { return this; }
  },
  // Line comments, with required delim (e.g. /*, --, #)
  // e.g. -- This is a comment
  line_comment: {
    type: 'line_comment',
    value: undefined,
    delim: ['--'],
    resolve({ dialect } = {}) {
      return {
        ...this,
        delim: this.delim.concat(dialect === 'mysql' ? ['#'] : [])
      };
    }
  },
};

// Lookup registries, organized by: statements, clauses, operators, keywords, dataTypes
// Each registry is split into: common (standard/shared), postgres, mysql

export const statements = {
  common: [
    // DDL
    'ALTER',
    'CREATE',
    'DROP',
    // DML
    'SELECT',
    'INSERT',
    'UPSERT',
    'UPDATE',
    'MERGE',
    'DELETE',
    // Transactions
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'RELEASE',
    // Utility
    'DESCRIBE',
    'EXPLAIN',
    'USE'
  ],
  postgres: [
    'ANALYZE',
    'CLUSTER',
    'COMMENT ON',
    'REFRESH',
    'REINDEX',
    'VACUUM'
  ],
  mysql: [
    'ANALYZE',
    'FLUSH',
    'LOCK',
    'OPTIMIZE',
    'RENAME',
    'REPAIR',
    'RESET',
    'SET',
    'SHOW',
    'TRUNCATE',
    'UNLOCK'
  ]
};

export const keywords = {
  common: [
    'ALL', 'ON', 'NO', 'KEY', 'ANY', 'AS', 'BY', 'ASC', 'CASE', 'CAST',
    'DEFAULT', 'DESC', 'DO', 'DISTINCT', 'ELSE', 'END', 'ESCAPE',
    'FIRST', 'LAST', 'FOLLOWING', 'FOR', 'HAVING', 'FILTER', 'SHARE',
    'JOIN', 'SEPARATOR', 'SKIP', 'LOCKED', 'NOWAIT', 'OF', 'RECURSIVE',
    'LIMIT', 'LOAD', 'NEXT', 'NOTHING', 'NULLS', 'OFFSET', 'ONLY', 'TIES',
    'OVER', 'PARTITION', 'PRECEDING', 'RANGE', 'RETURNING', 'ROW', 'ROWS', 'EXCLUDE',
    'SET', 'SOME', 'THEN', 'USING', 'MATERIALIZED', 'MODE', 'TEMPORARY',
    'WITHIN', 'BOTH',
    'DATABASE', 'TABLE', 'COLUMN', 'INDEX', 'SEQUENCE', 'TRIGGER', 'VIEW', 'SAVEPOINT',
    'VALUES', 'WHEN', 'WHERE', 'WINDOW', 'WITH', 'WITHOUT', 'TO', 'INTO',
    'FROM', 'GROUP', 'ORDER', 'PARTITION', 'BREADTH', 'DEPTH',
    'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'NATURAL', 'NO OTHERS',
    'ROLLUP', 'UNBOUNDED', 'CURRENT ROW', 'GROUPS', 'IGNORE', 'RESPECT',
  ],
  postgres: [
    'ARRAY', 'GROUPING SETS', 'CUBE', 'TABLESAMPLE', 'REPEATABLE', 'SEARCH',
    'LATERAL', 'ORDINALITY', 'OVERLAPS', 'SIMILAR', 'BERNOULLI', 'SYSTEM',
    'TABLESPACE', 'UNLOGGED', 'PERFORM', 'CURRENT OF', 'TYPE', 'EXTENSION',
    'IMMUTABLE', 'STABLE', 'VOLATILE', 'CYCLE', 'CONFLICT', 'TEMP',
    'TIME ZONE', 'FETCH', 'LOCAL'
  ],
  mysql: [
    'LOCK', 'RENAME', 'REPLACE', 'SHOW', 'UNLOCK',
    'HIGH_PRIORITY', 'CACHE', 'SQL_CACHE', 'SQL_NO_CACHE', 'STRAIGHT_JOIN',
    'DATABASES', 'TABLES', 'COLUMNS', 'STATUS', 'PROCEDURE', 'FUNCTION',
    'AUTO_INCREMENT', 'CHARACTER SET', 'ENGINE', 'VALUE', 'DUPLICATE',
  ]
};

export const functionNames = {
  common: [
    'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
    'IF', 'NULLIF', 'IFNULL',
    'COALESCE', 'GREATEST', 'LEAST', 'CONCAT', 'GROUPING',
    'CONCAT_WS', 'FORMAT', 'UNNEST',
    'MD5', 'SHA1',
    'ST_ASTEXT', 'ST_ASGEOJSON', 'ST_GEOMFROMTEXT',
    'ST_WITHIN', 'ST_CONTAINS', 'ST_INTERSECTS', 'ST_DISTANCE', 'ST_BUFFER'
  ],
  postgres: [
    'MAKE_DATE', 'MAKE_TIME', 'MAKE_TIMESTAMP',
    'TO_JSON', 'TO_JSONB', 'JSON_TYPEOF', 'JSONB_TYPEOF',
    'JSON_BUILD_ARRAY', 'JSONB_BUILD_ARRAY', 'JSON_BUILD_OBJECT', 'JSONB_BUILD_OBJECT',
    'JSON_POPULATE_RECORD', 'JSONB_POPULATE_RECORD', 'JSON_PATH_QUERY', 'JSON_PATH_EXISTS'
  ],
  mysql: [
    'CURDATE', 'CURTIME', 'SYSDATE', 'STR_TO_DATE', 'MAKEDATE', 'MAKETIME',
    'JSON_ARRAY', 'JSON_OBJECT', 'JSON_EXTRACT', 'JSON_UNQUOTE',
    'JSON_SET', 'JSON_INSERT', 'JSON_REPLACE', 'JSON_REMOVE',
    'JSON_SEARCH', 'JSON_CONTAINS', 'JSON_CONTAINS_PATH',
    'JSON_KEYS', 'JSON_ARRAY_APPEND', 'JSON_ARRAY_INSERT',
    'JSON_DEPTH', 'JSON_LENGTH', 'JSON_MERGE_PRESERVE',
    'JSON_MERGE_PATCH', 'JSON_PRETTY', 'JSON_STORAGE_FREE'
  ]
};

export const aggrFunctionNames = {
  common: [
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'COVAR_POP', 'COVAR_SAMP', 'CORR',
    'ROW_NUMBER',
    'BIT_AND', 'BIT_OR',
    'STDDEV_POP', 'STDDEV_SAMP', 'VAR_POP', 'VAR_SAMP', 'VARIANCE', 'STD',
    'LEAD', 'LAG', 'NTILE', 'FIRST_VALUE', 'LAST_VALUE',
  ],
  postgres: [
    'ARRAY_AGG', 'STRING_AGG', 'REGR_SLOPE',
    'PERCENTILE_CONT', 'PERCENTILE_DISC', 'MODE',
    'RANK', 'DENSE_RANK',
    'EVERY', 'BOOL_AND', 'BOOL_OR',
    'JSON_AGG',
    'JSON_OBJECT_AGG', 'JSONB_OBJECT_AGG',
    'XMLAGG',
  ],
  mysql: [
    'GROUP_CONCAT',
    'BIT_XOR',
    'JSON_ARRAYAGG',
    'JSON_OBJECTAGG',
  ]
};

export const dataTypes = {
  common: [
    'SMALLINT', 'INTEGER', 'INT', 'BIGINT',
    'DECIMAL', 'DEC', 'NUMERIC', 'REAL', 'FLOAT',
    'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL',
    'CHAR', 'CHARACTER', 'VARCHAR', 'TEXT',
    'BINARY', 'VARBINARY', 'BOOLEAN', 'JSON',
    'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON',
    'DOUBLE PRECISION', 'CHARACTER VARYING'
  ],
  postgres: [
    'SERIAL', 'BIGSERIAL', 'MONEY', 'BIT',
    'CIDR', 'INET', 'MACADDR', 'MACADDR8', 'TIMESTAMPTZ', 'TIMETZ',
    'TSVECTOR', 'TSQUERY', 'UUID', 'XML',
    'INT4RANGE', 'INT8RANGE', 'NUMRANGE',
    'TSRANGE', 'TSTZRANGE', 'DATERANGE',
    'BOX', 'PATH', 'CIRCLE', 'LINE', 'LSEG', 'POLYGON',
    'OID', 'BIT VARYING', 'JSONB'/*, TODO'NAME'*/, 'REGCLASS'
  ],
  mysql: [
    'TINYINT', 'MEDIUMINT', 'BIT', 'YEAR', 'DATETIME',
    'TINYTEXT', 'QUERY', 'MEDIUMTEXT', 'LONGTEXT',
    'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
    'ENUM',
    'GEOMETRYCOLLECTION', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON',
    'BOOL'
  ]
};

export const operators = {
  common: [
    // Custom/graph-style
    ['<~', { prec: 90, assoc: 'left' }],
    ['~>', { prec: 90, assoc: 'right' }],
    ['BETWEEN', { prec: 85/* Higher than NOT */, assoc: 'left' }],
    ['EXISTS', { prec: 83/* Higher than NOT */, assoc: 'left' }],
    ['UNIQUE', { prec: 83/* Higher than NOT */, assoc: 'left' }],
    ['NOT', { prec: 80, assoc: 'right' }],
    // Arithmetic
    ['*', { prec: 70, assoc: 'left' }],
    ['/', { prec: 70, assoc: 'left' }],
    ['%', { prec: 70, assoc: 'left' }],
    ['+', { prec: 60, assoc: 'left' }],
    ['-', { prec: 60, assoc: 'left' }],
    // Bitwise
    ['&', { prec: 60, assoc: 'left' }],
    ['|', { prec: 60, assoc: 'left' }],
    ['<<', { prec: 60, assoc: 'left' }],
    ['>>', { prec: 60, assoc: 'left' }],
    // Comparison
    ['=', { prec: 50, assoc: 'left' }],
    ['!=', { prec: 50, assoc: 'left' }],
    ['<>', { prec: 50, assoc: 'left' }],
    ['<', { prec: 50, assoc: 'left' }],
    ['<=', { prec: 50, assoc: 'left' }],
    ['>', { prec: 50, assoc: 'left' }],
    ['>=', { prec: 50, assoc: 'left' }],
    ['IS', { prec: 50, assoc: 'left' }],
    ['IS NOT', { prec: 50, assoc: 'left' }],
    // Pattern / membership
    ['DISTINCT FROM', { prec: 50, assoc: 'left' }],
    ['IN', { prec: 50, assoc: 'left', negatable: true }],
    ['LIKE', { prec: 50, assoc: 'left', negatable: true }],
    // Logical
    ['AND', { prec: 40, assoc: 'left' }],
    ['OR', { prec: 30, assoc: 'left' }],
    // 'INTERSECT', 'UNION', 'EXCEPT'
    ['INTERSECT', { prec: 20, assoc: 'left' }],
    ['UNION', { prec: 10, assoc: 'left' }],
    ['EXCEPT', { prec: 10, assoc: 'left' }],
  ],
  postgres: [
    ['COLLATE', { prec: 83, assoc: 'left' }],
    ['||', { prec: 60, assoc: 'left' }],
    // Cast
    ['::', { prec: 100, assoc: 'left' }],
    ['AT', { prec: 95, assoc: 'left' }],
    ['^', { prec: 90, assoc: 'left' }],
    ['#', { prec: 60, assoc: 'left' }],
    // JSON/JSONB
    ['->', { prec: 80, assoc: 'left' }],
    ['->>', { prec: 80, assoc: 'left' }],
    ['#>', { prec: 80, assoc: 'left' }],
    ['#>>', { prec: 80, assoc: 'left' }],
    ['@>', { prec: 80, assoc: 'left' }],
    ['<@', { prec: 80, assoc: 'left' }],
    ['?', { prec: 80, assoc: 'left' }],
    ['?|', { prec: 80, assoc: 'left' }],
    ['?&', { prec: 80, assoc: 'left' }],
    ['-@', { prec: 80, assoc: 'left' }],
    ['#-', { prec: 80, assoc: 'left' }],
    ['@?', { prec: 80, assoc: 'left' }],
    ['@@', { prec: 80, assoc: 'left' }],
    ['ILIKE', { prec: 50, assoc: 'left', negatable: true }],
    ['~', { prec: 50, assoc: 'left' }],
    ['!~', { prec: 50, assoc: 'left' }],
    ['~*', { prec: 50, assoc: 'left' }],
    ['!~*', { prec: 50, assoc: 'left' }],
    ['SIMILAR TO', { prec: 50, assoc: 'left' }],
    // GIS/PostGIS
    ['&&', { prec: 60, assoc: 'left' }],
    ['<->', { prec: 60, assoc: 'left' }],
    ['@', { prec: 60, assoc: 'left' }],
    ['&<', { prec: 60, assoc: 'left' }],
    ['&>', { prec: 60, assoc: 'left' }],
    ['|-', { prec: 60, assoc: 'left' }],
    ['-|', { prec: 60, assoc: 'left' }],
    ['<<', { prec: 60, assoc: 'left' }],
    ['>>', { prec: 60, assoc: 'left' }],
    ['<<|', { prec: 60, assoc: 'left' }],
    ['|>>', { prec: 60, assoc: 'left' }],
    ['&<|', { prec: 60, assoc: 'left' }],
    ['|&>', { prec: 60, assoc: 'left' }],
    ['~=', { prec: 50, assoc: 'left' }],
    ['?#', { prec: 60, assoc: 'left' }],
    ['?-', { prec: 60, assoc: 'left' }],
    ['?-|', { prec: 60, assoc: 'left' }],
    ['?|', { prec: 60, assoc: 'left' }],
    ['?||', { prec: 60, assoc: 'left' }],
    ['#', { prec: 60, assoc: 'left' }],
    ['##', { prec: 60, assoc: 'left' }],
    ['@-@', { prec: 60, assoc: 'left' }]
  ],
  mysql: [
    ['DIV', { prec: 70, assoc: 'left' }],
    ['MOD', { prec: 70, assoc: 'left' }],
    ['BINARY', { prec: 90, assoc: 'right' }],
    ['^', { prec: 80, assoc: 'left' }],
    ['~', { prec: 85, assoc: 'right' }],
    ['<=>', { prec: 50, assoc: 'left' }],
    ['REGEXP', { prec: 50, assoc: 'left' }],
    ['RLIKE', { prec: 50, assoc: 'left' }],
    ['!', { prec: 80, assoc: 'right' }],
    ['XOR', { prec: 40, assoc: 'left' }],
    ['&&', { prec: 40, assoc: 'left' }],
    ['||', { prec: 30, assoc: 'left' }],
    [':=', { prec: 10, assoc: 'right' }],
    ['SOUNDS LIKE', { prec: 50, assoc: 'left' }]
  ]
};
