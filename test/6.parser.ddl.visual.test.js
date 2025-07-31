import { $describe, $it, testParseAndStringify } from './0.parser.js';

$describe('Parser - DDL Constraints', () => {
    $describe('Table Constraints', () => {
        $it('should parse TABLE foreign key constraint', async () => {
            await testParseAndStringify('TableFKConstraint', 'CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id)');
            await testParseAndStringify('TableFKConstraint', 'FOREIGN KEY (user_id) REFERENCES users (id)');
            await testParseAndStringify('TableFKConstraint', 'CONSTRAINT fk_user FOREIGN KEY (user_id, group_id) REFERENCES users (id, group_id) ON DELETE CASCADE ON UPDATE SET NULL');
        });

        $it('should parse TABLE foreign key constraint - Postgres', async () => {
            await testParseAndStringify('TableFKConstraint', 'FOREIGN KEY (user_id) REFERENCES users');
            await testParseAndStringify('TableFKConstraint', 'FOREIGN KEY (user_id) REFERENCES users (id) DEFERRABLE INITIALLY DEFERRED', { dialect: 'postgres' });
        });

        $it('should parse TABLE primary key constraint', async () => {
            await testParseAndStringify('TablePKConstraint', 'CONSTRAINT pk_id PRIMARY KEY (id)');
            await testParseAndStringify('TablePKConstraint', 'PRIMARY KEY (id)');
            await testParseAndStringify('TablePKConstraint', 'PRIMARY KEY (id, name)');
        });

        $it('should parse TABLE unique key constraint', async () => {
            await testParseAndStringify('TableUKConstraint', 'CONSTRAINT uk_email UNIQUE (email)');
            await testParseAndStringify('TableUKConstraint', 'UNIQUE (email)');
            await testParseAndStringify('TableUKConstraint', 'UNIQUE (email, username)');
        });
    });

    $describe('Check Constraints', () => {
        $it('should parse CHECK constraint', async () => {
            await testParseAndStringify('CheckConstraint', 'CHECK (age > 0)');
            await testParseAndStringify('CheckConstraint', 'CHECK (salary BETWEEN 1000 AND 5000) NO INHERIT');
            await testParseAndStringify('CheckConstraint', 'CHECK (status IN (\'active\', \'inactive\'))');
            await testParseAndStringify('CheckConstraint', 'CONSTRAINT chk_age CHECK (age > 0)');
        });
    });

    $describe('Column Default Constraints', () => {
        $it('should parse column DEFAULT constraint', async () => {
            await testParseAndStringify('ColumnDefaultConstraint', 'DEFAULT 0');
            await testParseAndStringify('ColumnDefaultConstraint', 'CONSTRAINT uk_email DEFAULT \'abc\'');
            await testParseAndStringify('ColumnDefaultConstraint', 'DEFAULT CURRENT_TIMESTAMP');
            await testParseAndStringify('ColumnDefaultConstraint', 'DEFAULT NULL');
        });
    });

    $describe('Column Expression Constraints', () => {
        $it('should parse column expression constraint', async () => {
            await testParseAndStringify('ColumnExpressionConstraint', 'GENERATED ALWAYS AS (col1 + col2) STORED');
            await testParseAndStringify('ColumnExpressionConstraint', 'CONSTRAINT expr GENERATED ALWAYS AS (col1 + col2) STORED');
        });

        $it('should parse column expression constraint - MySQL', async () => {
            await testParseAndStringify('ColumnExpressionConstraint', 'GENERATED ALWAYS AS (LOWER(name))', { dialect: 'mysql' });
            await testParseAndStringify('ColumnExpressionConstraint', 'GENERATED ALWAYS AS (LOWER(name)) STORED', { dialect: 'mysql' });
            await testParseAndStringify('ColumnExpressionConstraint', 'GENERATED ALWAYS AS (LOWER(name)) VIRTUAL', { dialect: 'mysql' });
            await testParseAndStringify('ColumnExpressionConstraint', 'AS (col1 * 2)', { dialect: 'mysql' });
        });
    });

    $describe('Column Foreign Key Constraints', () => {
        $it('should parse column foreign key constraint', async () => {
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id)');
            await testParseAndStringify('ColumnFKConstraint', 'CONSTRAINT fk1 REFERENCES users (id)');
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id) MATCH FULL');
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id) ON DELETE CASCADE');
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id) ON UPDATE SET NULL');
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id) MATCH FULL ON DELETE SET NULL ON UPDATE SET NULL');
        });

        $it('should parse column foreign key constraint - Postgres', async () => {
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users');
            await testParseAndStringify('ColumnFKConstraint', 'REFERENCES users (id) DEFERRABLE INITIALLY DEFERRED', { dialect: 'postgres' });
        });
    });

    $describe('Column Identity Constraints', () => {
        $it('should parse column identity constraint', async () => {
            await testParseAndStringify('ColumnIdentityConstraint', 'GENERATED BY DEFAULT AS IDENTITY');
            await testParseAndStringify('ColumnIdentityConstraint', 'GENERATED ALWAYS AS IDENTITY');
            await testParseAndStringify('ColumnIdentityConstraint', 'CONSTRAINT id1 GENERATED ALWAYS AS IDENTITY');
            return; // TODO
            await testParseAndStringify('ColumnIdentityConstraint', 'GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1)');
        });
    });

    $describe('Column Null Constraints', () => {
        $it('should parse column NULL constraint', async () => {
            await testParseAndStringify('ColumnNullConstraint', 'NOT NULL');
            await testParseAndStringify('ColumnNullConstraint', 'NULL');
            await testParseAndStringify('ColumnNullConstraint', 'CONSTRAINT null_key NULL');
        });
    });

    $describe('Column Primary Key Constraints', () => {
        $it('should parse column primary key constraint', async () => {
            await testParseAndStringify('ColumnPKConstraint', 'PRIMARY KEY');
            await testParseAndStringify('ColumnPKConstraint', 'CONSTRAINT pk PRIMARY KEY');
        });
    });

    $describe('Column Unique Key Constraints', () => {
        $it('should parse column unique key constraint', async () => {
            await testParseAndStringify('ColumnUKConstraint', 'UNIQUE');
            await testParseAndStringify('ColumnUKConstraint', 'CONSTRAINT uk UNIQUE');
        });
    });

    $describe('MySQL AUTO_INCREMENT Constraints', () => {
        $it('should parse MySQL AUTO_INCREMENT constraint', async () => {
            await testParseAndStringify('MYAutoIncrementConstraint', 'AUTO_INCREMENT', { dialect: 'mysql' });
        });
    });

    $describe('Other vendor-specific constraints', () => {
        return; // TODO
        $it('should parse MySQL ON UPDATE CURRENT_TIMESTAMP', async () => {
            await testParseAndStringify('ColumnDefaultConstraint', 'ON UPDATE CURRENT_TIMESTAMP', { dialect: 'mysql' });
        });

        $it('should parse SQLite AUTOINCREMENT', async () => {
            await testParseAndStringify('ColumnPKConstraint', 'PRIMARY KEY AUTOINCREMENT', { dialect: 'sqlite' });
        });
    });
});

$describe('Parser - DDL Statements', () => {
    $describe('CreateTableStmt', () => {
        $it('should parse CREATE TABLE with single column', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT)');
        });

        $it('should parse CREATE TABLE with multiple columns', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT, name VARCHAR(100))');
        });

        $it('should parse CREATE TABLE with column constraints', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255) UNIQUE)');
        });

        $it('should parse CREATE TABLE with table constraints', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT, name TEXT, CONSTRAINT pk_id PRIMARY KEY (id))');
        });

        $it('should parse CREATE TABLE with multiple constraints', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT, name TEXT, PRIMARY KEY (id), UNIQUE (name))');
        });

        $it('should parse CREATE TABLE with foreign key constraint', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE orders (id INT, user_id INT, FOREIGN KEY (user_id) REFERENCES users (id))');
        });

        $it('should parse CREATE TABLE with all constraint types', async () => {
            const sql =
`CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  age INT CHECK (age > 0),
  group_id INT,
  CONSTRAINT fk_group FOREIGN KEY (group_id) REFERENCES tbl_groups (id)
)`;
            await testParseAndStringify('CreateTableStmt', sql, { prettyPrint: true, autoLineBreakThreshold: 5 });
        });

        $it('should parse CREATE TABLE IF NOT EXISTS', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE IF NOT EXISTS users (id INT)');
        });

        $it('should parse CREATE TABLE with schema-qualified name', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE public.users (id INT)');
        });

        $it('should parse CREATE TEMPORARY TABLE', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TEMPORARY TABLE temp_users (id INT)');
        });

        return;// TODO

        $it('should parse CREATE TABLE with WITHOUT ROWID (SQLite)', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT PRIMARY KEY) WITHOUT ROWID', { dialect: 'sqlite' });
        });

        $it('should parse CREATE TABLE with table options (MySQL)', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8', { dialect: 'mysql' });
        });

        $it('should parse CREATE TABLE AS SELECT', async () => {
            await testParseAndStringify('CreateTableStmt', 'CREATE TABLE users AS SELECT * FROM old_users');
        });
    });
});
