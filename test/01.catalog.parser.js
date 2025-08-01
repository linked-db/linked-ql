import { testParseAndStringify } from './00.parser.js';

const catalog = [];


const sql =
  `public (
  users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE CHECK (email LIKE '%@%'),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CHECK (password_hash LIKE '3...'),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned'))
  ),
  orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    order_total NUMERIC(10, 2) NOT NULL CHECK (order_total >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'shipped')),
    placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
  ),
  products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(30) UNIQUE NOT NULL,
    price NUMERIC(8, 2) NOT NULL CHECK (price > 0),
    stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  ),
  order_items (
    order_id UUID NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(8, 2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products (product_id)
  )
)`;

const resultNode = await testParseAndStringify('SchemaSchema', sql, { prettyPrint: true });
catalog.push(resultNode);

const sql2 =
  `public2 (
  inventory_adjustments (
    adjustment_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    adjustment_quantity INTEGER NOT NULL CHECK (adjustment_quantity != 0),
    reason TEXT NOT NULL CHECK (reason IN ('restock', 'return', 'damage', 'manual')),
    adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_adjusted_product FOREIGN KEY (product_id) REFERENCES products (product_id)
  ),
  system_logs (
    log_id BIGSERIAL PRIMARY KEY,
    log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error')),
    message TEXT NOT NULL,
    source_module TEXT,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
)`;

const resultNode2 = await testParseAndStringify('SchemaSchema', sql2, { prettyPrint: true });
catalog.push(resultNode2);

export { catalog }
