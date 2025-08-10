import { testParseAndStringify } from './00.parser.js';

const catalog = [];


const sql =
  `public (
  users (
    id SERIAL PRIMARY KEY,
    parent_user INTEGER,
    metadata INTEGER,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE CHECK (email LIKE '%@%'),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CHECK (password_hash LIKE '3...'),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
    CONSTRAINT fk_meta FOREIGN KEY (metadata) REFERENCES public2.user_metadata (id) ON DELETE CASCADE,
    CONSTRAINT fk_parent_user FOREIGN KEY (parent_user) REFERENCES users (id) ON DELETE CASCADE
  ),
  orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_order UUID,
    user INTEGER NOT NULL,
    order_total NUMERIC(10, 2) NOT NULL CHECK (order_total >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'shipped')),
    placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_parent_order FOREIGN KEY (parent_order) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user) REFERENCES users (id) ON DELETE CASCADE
  ),
  products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(30) UNIQUE NOT NULL,
    price NUMERIC(8, 2) NOT NULL CHECK (price > 0),
    stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  ),
  order_items (
    "order" UUID NOT NULL,
    product INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(8, 2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY ("order", product),
    CONSTRAINT fk_order FOREIGN KEY ("order") REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_product FOREIGN KEY (product) REFERENCES products (id)
  )
)`;

const resultNode = await testParseAndStringify('SchemaSchema', sql, { prettyPrint: true, assert: false });
catalog.push(resultNode);

const sql2 =
  `public2 (
  inventory_adjustments (
    id SERIAL PRIMARY KEY,
    product INTEGER NOT NULL,
    adjustment_quantity INTEGER NOT NULL CHECK (adjustment_quantity != 0),
    reason TEXT NOT NULL CHECK (reason IN ('restock', 'return', 'damage', 'manual')),
    adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_adjusted_product FOREIGN KEY (product) REFERENCES products (id)
  ),
  system_logs (
    id BIGSERIAL PRIMARY KEY,
    log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error')),
    message TEXT NOT NULL,
    source_module TEXT,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ),
  user_metadata (
    id BIGSERIAL PRIMARY KEY,
    data JSON NOT NULL
  )
)`;

const resultNode2 = await testParseAndStringify('SchemaSchema', sql2, { prettyPrint: true });
catalog.push(resultNode2);

export { catalog }
