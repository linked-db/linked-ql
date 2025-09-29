import * as cte from './cte/index.js';
import * as ddl from './ddl/index.js';
import * as dml from './dml/index.js';
import * as dql from './dql/index.js';
import * as expr from './expr/index.js';
import * as qualif from './qualif/index.js';
import * as type from './type/index.js';
import { JSONSchema } from './abstracts/JSONSchema.js';
import { Script } from './Script.js';
import { registry } from './registry.js';

Object.assign(registry, { ...cte, ...ddl, ...dml, ...dql, ...expr, ...qualif, ...type, Script, JSONSchema });
