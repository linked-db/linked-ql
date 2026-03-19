
// =========================
// SYSTEM BOOTSTRAP DATASET
// =========================

import { BootstrapTable } from './BootstrapTable.js';

export const SYSTEM_BOOTSTRAP_DATA = {

    sys_namespaces: [
        { id: 1, name: 'sys', kind: 'schema', owner: null, replication_origin: null, replication_origin_type: null, engine_attrs: null }
    ],

    sys_relations: [
        { id: 100, namespace_id: 1, name: 'sys_namespaces', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 101, namespace_id: 1, name: 'sys_relations', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 102, namespace_id: 1, name: 'sys_types', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 103, namespace_id: 1, name: 'sys_columns', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 104, namespace_id: 1, name: 'sys_constraints', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 105, namespace_id: 1, name: 'sys_indexes', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 106, namespace_id: 1, name: 'sys_dependencies', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null },
        { id: 108, namespace_id: 1, name: 'sys_outsync_queue', kind: 'table', persistence: 'permanent', view_spec: null, replication_slot_name: null, replication_last_seen_commit: null, version_major: 1, version_minor: 0, version_patch: 0, engine_attrs: null }
    ],

    sys_types: [
        { id: 10, namespace_id: 1, name: 'BIGINT', kind: 'base', base_type_id: null, enum_values: null, domain_constraints_ast: null },
        { id: 11, namespace_id: 1, name: 'INT', kind: 'base', base_type_id: null, enum_values: null, domain_constraints_ast: null },
        { id: 12, namespace_id: 1, name: 'TEXT', kind: 'base', base_type_id: null, enum_values: null, domain_constraints_ast: null },
        { id: 13, namespace_id: 1, name: 'JSON', kind: 'base', base_type_id: null, enum_values: null, domain_constraints_ast: null },
        { id: 14, namespace_id: 1, name: 'BOOLEAN', kind: 'base', base_type_id: null, enum_values: null, domain_constraints_ast: null }
    ],

    sys_columns: [

        // sys_namespaces (100)
        { id: 1001, relation_id: 100, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1003, relation_id: 100, name: 'name', position: 3, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1004, relation_id: 100, name: 'kind', position: 4, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1005, relation_id: 100, name: 'owner', position: 5, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1006, relation_id: 100, name: 'replication_origin', position: 6, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1007, relation_id: 100, name: 'replication_origin_type', position: 7, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1008, relation_id: 100, name: 'engine_attrs', position: 8, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_relations (101)
        { id: 1101, relation_id: 101, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1102, relation_id: 101, name: 'namespace_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1103, relation_id: 101, name: 'name', position: 3, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1104, relation_id: 101, name: 'kind', position: 4, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1105, relation_id: 101, name: 'persistence', position: 5, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1106, relation_id: 101, name: 'view_spec', position: 6, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1107, relation_id: 101, name: 'replication_slot_name', position: 7, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: { is_system_column: true } },
        { id: 1108, relation_id: 101, name: 'replication_last_seen_commit', position: 8, type_id: 10, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: { is_system_column: true } },
        { id: 1109, relation_id: 101, name: 'version_major', position: 9, type_id: 11, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: { is_system_column: true } },
        { id: 1110, relation_id: 101, name: 'version_minor', position: 10, type_id: 11, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: { is_system_column: true } },
        { id: 1111, relation_id: 101, name: 'version_patch', position: 11, type_id: 11, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: { is_system_column: true } },
        { id: 1112, relation_id: 101, name: 'engine_attrs', position: 12, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_types (102)
        { id: 1201, relation_id: 102, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1202, relation_id: 102, name: 'namespace_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1203, relation_id: 102, name: 'name', position: 3, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1204, relation_id: 102, name: 'kind', position: 4, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1205, relation_id: 102, name: 'base_type_id', position: 5, type_id: 10, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1206, relation_id: 102, name: 'enum_values', position: 6, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1207, relation_id: 102, name: 'domain_constraints_ast', position: 7, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_columns (103)
        { id: 1301, relation_id: 103, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1302, relation_id: 103, name: 'relation_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1303, relation_id: 103, name: 'name', position: 3, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1304, relation_id: 103, name: 'position', position: 4, type_id: 11, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1305, relation_id: 103, name: 'type_id', position: 5, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1306, relation_id: 103, name: 'not_null', position: 6, type_id: 14, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1307, relation_id: 103, name: 'is_generated', position: 7, type_id: 14, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1308, relation_id: 103, name: 'generation_expr_ast', position: 8, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1309, relation_id: 103, name: 'generation_rule', position: 9, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1310, relation_id: 103, name: 'default_expr_ast', position: 10, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1311, relation_id: 103, name: 'engine_attrs', position: 11, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_constraints (104)
        { id: 1401, relation_id: 104, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1402, relation_id: 104, name: 'relation_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1403, relation_id: 104, name: 'name', position: 3, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1404, relation_id: 104, name: 'kind', position: 4, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1405, relation_id: 104, name: 'column_ids', position: 5, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1406, relation_id: 104, name: 'ck_expression_ast', position: 6, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1407, relation_id: 104, name: 'fk_target_relation_id', position: 8, type_id: 10, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1408, relation_id: 104, name: 'fk_target_column_ids', position: 9, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1409, relation_id: 104, name: 'fk_match_rule', position: 10, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1410, relation_id: 104, name: 'fk_update_rule', position: 11, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1411, relation_id: 104, name: 'fk_delete_rule', position: 12, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_indexes (105)
        { id: 1501, relation_id: 105, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1502, relation_id: 105, name: 'relation_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1503, relation_id: 105, name: 'name', position: 3, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1504, relation_id: 105, name: 'method', position: 4, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1505, relation_id: 105, name: 'is_unique', position: 5, type_id: 14, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1506, relation_id: 105, name: 'kind', position: 6, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1507, relation_id: 105, name: 'column_ids', position: 7, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1508, relation_id: 105, name: 'expression_ast', position: 8, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1509, relation_id: 105, name: 'predicate_ast', position: 9, type_id: 13, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_dependencies (106)
        { id: 1601, relation_id: 106, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1602, relation_id: 106, name: 'dependent_object_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1603, relation_id: 106, name: 'dependent_object_kind', position: 3, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1604, relation_id: 106, name: 'referenced_object_id', position: 4, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1605, relation_id: 106, name: 'referenced_object_kind', position: 5, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1606, relation_id: 106, name: 'dependency_tag', position: 6, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },

        // sys_outsync_queue (108)
        { id: 1801, relation_id: 108, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1802, relation_id: 108, name: 'relation_id', position: 2, type_id: 10, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1803, relation_id: 108, name: 'origin', position: 3, type_id: 13, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1804, relation_id: 108, name: 'query_spec', position: 4, type_id: 13, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1805, relation_id: 108, name: 'event_payload', position: 5, type_id: 13, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1806, relation_id: 108, name: 'status', position: 6, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1807, relation_id: 108, name: 'retry_count', position: 7, type_id: 11, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1808, relation_id: 108, name: 'last_error', position: 8, type_id: 12, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1809, relation_id: 108, name: 'created_at', position: 9, type_id: 10, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null },
        { id: 1810, relation_id: 108, name: 'updated_at', position: 10, type_id: 10, not_null: false, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null }

    ],

    sys_constraints: [

        // PRIMARY KEYS
        { id: 2001, relation_id: 100, name: 'sys_namespaces__pk', kind: 'PRIMARY KEY', column_ids: [1001], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2002, relation_id: 101, name: 'sys_relations__pk', kind: 'PRIMARY KEY', column_ids: [1101], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2003, relation_id: 102, name: 'sys_types__pk', kind: 'PRIMARY KEY', column_ids: [1201], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2004, relation_id: 103, name: 'sys_columns__pk', kind: 'PRIMARY KEY', column_ids: [1301], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2005, relation_id: 104, name: 'sys_constraints__pk', kind: 'PRIMARY KEY', column_ids: [1401], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2006, relation_id: 105, name: 'sys_indexes__pk', kind: 'PRIMARY KEY', column_ids: [1501], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2007, relation_id: 106, name: 'sys_dependencies__pk', kind: 'PRIMARY KEY', column_ids: [1601], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2009, relation_id: 108, name: 'sys_outsync_queue__pk', kind: 'PRIMARY KEY', column_ids: [1801], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },

        // UNIQUE
        { id: 2101, relation_id: 100, name: 'sys_namespaces__name_uk', kind: 'UNIQUE', column_ids: [1003], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2102, relation_id: 101, name: 'sys_relations__namespace_id_name_uk', kind: 'UNIQUE', column_ids: [1102, 1103], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2103, relation_id: 102, name: 'sys_types__namespace_id_name_uk', kind: 'UNIQUE', column_ids: [1202, 1203], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2104, relation_id: 103, name: 'sys_columns__relation_id_name_uk', kind: 'UNIQUE', column_ids: [1302, 1303], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2105, relation_id: 104, name: 'sys_constraints__relation_id_name_uk', kind: 'UNIQUE', column_ids: [1402, 1403], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
        { id: 2106, relation_id: 105, name: 'sys_indexes__relation_id_name_uk', kind: 'UNIQUE', column_ids: [1502, 1503], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },

        // FOREIGN KEYS
        { id: 2201, relation_id: 101, name: 'sys_relations__namespace_id_fk', kind: 'FOREIGN KEY', column_ids: [1102], ck_expression_ast: null, fk_target_relation_id: 100, fk_target_column_ids: [1001], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },
        { id: 2202, relation_id: 103, name: 'sys_columns__relation_id_fk', kind: 'FOREIGN KEY', column_ids: [1302], ck_expression_ast: null, fk_target_relation_id: 101, fk_target_column_ids: [1101], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },
        { id: 2203, relation_id: 104, name: 'sys_constraints__relation_id_fk', kind: 'FOREIGN KEY', column_ids: [1402], ck_expression_ast: null, fk_target_relation_id: 101, fk_target_column_ids: [1101], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },
        { id: 2204, relation_id: 104, name: 'sys_constraints__fk_target_relation_id_fk', kind: 'FOREIGN KEY', column_ids: [1407], ck_expression_ast: null, fk_target_relation_id: 101, fk_target_column_ids: [1101], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },
        { id: 2205, relation_id: 105, name: 'sys_indexes__relation_id_fk', kind: 'FOREIGN KEY', column_ids: [1502], ck_expression_ast: null, fk_target_relation_id: 101, fk_target_column_ids: [1101], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },
        { id: 2207, relation_id: 108, name: 'sys_outsync_queue__relation_id_fk', kind: 'FOREIGN KEY', column_ids: [1802], ck_expression_ast: null, fk_target_relation_id: 101, fk_target_column_ids: [1101], fk_match_rule: 'FULL', fk_update_rule: 'CASCADE', fk_delete_rule: 'CASCADE' },

    ],

    sys_indexes: [

        // UNIQUE
        { id: 2101, relation_id: 100, name: 'sys_namespaces__name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1003], expression_ast: null, predicate_ast: null },
        { id: 2102, relation_id: 101, name: 'sys_relations__namespace_id_name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1102, 1103], expression_ast: null, predicate_ast: null },
        { id: 2103, relation_id: 102, name: 'sys_types__namespace_id_name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1202, 1203], expression_ast: null, predicate_ast: null },
        { id: 2104, relation_id: 103, name: 'sys_columns__relation_id_name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1302, 1303], expression_ast: null, predicate_ast: null },
        { id: 2105, relation_id: 104, name: 'sys_constraints__relation_id_name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1402, 1403], expression_ast: null, predicate_ast: null },
        { id: 2106, relation_id: 105, name: 'sys_indexes__relation_id_name_idx', method: 'hash', is_unique: true, kind: 'column', column_ids: [1502, 1503], expression_ast: null, predicate_ast: null },

        // FOREIGN KEYS
        { id: 2201, relation_id: 101, name: 'sys_relations__namespace_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1102], expression_ast: null, predicate_ast: null },
        { id: 2202, relation_id: 103, name: 'sys_columns__relation_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1302], expression_ast: null, predicate_ast: null },
        { id: 2203, relation_id: 104, name: 'sys_constraints__relation_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1402], expression_ast: null, predicate_ast: null },
        { id: 2204, relation_id: 104, name: 'sys_constraints__fk_target_relation_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1407], expression_ast: null, predicate_ast: null },
        { id: 2205, relation_id: 105, name: 'sys_indexes__relation_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1502], expression_ast: null, predicate_ast: null },
        { id: 2207, relation_id: 108, name: 'sys_outsync_queue__relation_id_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1802], expression_ast: null, predicate_ast: null },
        { id: 2208, relation_id: 108, name: 'sys_outsync_queue__status_idx', method: 'hash', is_unique: false, kind: 'column', column_ids: [1806], expression_ast: null, predicate_ast: null },
        
    ],

    sys_dependencies: []
};

// =========================
// USERSPACE DEFAULT DATA
// =========================

export const DEFAULT_USERSPACE_DATA = [

    // sys namespace
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_namespaces', keyColumns: ['id'] },
        new: { id: 1, name: 'sys', kind: 'schema' }
    },

    // public namespace
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_namespaces', keyColumns: ['id'] },
        new: { id: 101, name: 'public', kind: 'schema' }
    },

    // relation public.test
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_relations', keyColumns: ['id'] },
        new: { id: 501, namespace_id: 101, name: 'test', kind: 'table', persistence: 'permanent', version_major: 1, version_minor: 0, version_patch: 0 }
    },

    // columns & constraints
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_columns', keyColumns: ['id'] },
        new: { id: 5001, relation_id: 501, name: 'id', position: 1, type_id: 10, not_null: true, is_generated: true, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null }
    },
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_columns', keyColumns: ['id'] },
        new: { id: 5002, relation_id: 501, name: 'name', position: 2, type_id: 12, not_null: true, is_generated: false, generation_expr_ast: null, generation_rule: null, default_expr_ast: null, engine_attrs: null }
    },
    {
        op: 'insert',
        relation: { namespace: 'sys', name: 'sys_constraints', keyColumns: ['id'] },
        new: { id: 5001, relation_id: 501, name: 'public_test_pk', kind: 'PRIMARY KEY', column_ids: [5001], ck_expression_ast: null, fk_target_relation_id: null, fk_target_column_ids: null, fk_match_rule: null, fk_update_rule: null, fk_delete_rule: null },
    },

    // data for test
    {
        op: 'insert',
        relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
        new: { id: 1, name: 'John Doe' }
    },
    {
        op: 'insert',
        relation: { namespace: 'public', name: 'test', keyColumns: ['id'] },
        new: { id: 2, name: 'Jane Doe' }
    },
];

export const systemRelationIds = Object.fromEntries(
    SYSTEM_BOOTSTRAP_DATA.sys_relations.map((tblDef) => {
        return [tblDef.name, tblDef.id];
    })
);

export const bootstrapCatalog = new Map(
    Object.entries(SYSTEM_BOOTSTRAP_DATA).map(([name, entries]) => {
        return [name, new BootstrapTable(entries)];
    })
);
