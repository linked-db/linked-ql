import { _isObject } from '@webqit/util/js/index.js';
import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import { _difference } from '@webqit/util/arr/index.js';
import { AbstractPrefixableNameableNode } from '../abstracts/AbstractPrefixableNameableNode.js';
import { GlobalTableRef } from '../../expr/refs/GlobalTableRef.js';
import { AbstractLevel2Constraint } from '../constraints/abstracts/AbstractLevel2Constraint.js';
import { PrimaryKeyConstraint } from '../constraints/PrimaryKeyConstraint.js';
import { ForeignKeyConstraint } from '../constraints/ForeignKeyConstraint.js';
import { UniqueKeyConstraint } from '../constraints/UniqueKeyConstraint.js';
import { CheckConstraint } from '../constraints/CheckConstraint.js';
import { GlobalDatabaseRef } from '../..//expr/refs/GlobalDatabaseRef.js';
import { ColumnSchema } from '../column/ColumnSchema.js';
import { IndexSchema } from '../index/IndexSchema.js';
import { TableCDL } from './TableCDL.js';
import { Lexer } from '../../Lexer.js';

export class TableSchema extends AbstractPrefixableNameableNode {
	static get CONSTRAINT_TYPES() { return [PrimaryKeyConstraint, ForeignKeyConstraint, UniqueKeyConstraint, CheckConstraint]; }
	static get PREFIX_TYPE() { return [GlobalDatabaseRef]; }

	#columns = [];
	#constraints = [];
	#indexes = [];
	#nodes = new Set;

	[Symbol.iterator]() { return this.#columns[Symbol.iterator](); }

	get length() { return this.#columns.length; }

	$capture(requestName, requestSource) {
		if (['TABLE_SCHEMA'].includes(requestName)) return this;
		return super.$capture(requestName, requestSource);
	}

	$bubble(eventType, eventSource) {
		if (['CONNECTED', 'DISCONNECTED'].includes(eventType) && [ColumnSchema, AbstractLevel2Constraint, IndexSchema].some(x => eventSource instanceof x && (
			eventSource.contextNode === this || (eventSource.contextNode instanceof ColumnSchema && eventSource.contextNode.contextNode === this)
		))) {
			if (eventType === 'DISCONNECTED') this.#nodes.delete(eventSource);
			else this.#nodes.add(eventSource);
		}
		return super.$bubble(eventType, eventSource);
	}

	/* -- SUBTREE I/O */

	column(arg1, ...args) {
		if (typeof arg1 === 'string') {
			const existing = this.#columns.find((col) => col.identifiesAs(arg1));
			if (!args.length) return existing;
			if (args[0] === false) {
				this.#columns = this.#columns.filter((c) => c !== existing);
				existing?.bubble('DISCONNECTED');
				return this;
			}
			arg1 = { name: arg1, ...(typeof args[0] === 'object' ? args[0] : { type: args[0] }) };
		}
		this.#columns = this.$castInputs([arg1], ColumnSchema, this.#columns, 'columns', null, (existing) => {
			return this.#columns.find((col) => col.identifiesAs(existing.name()));
		});
		return this;
	}

	constraint(constraint) {
		if (typeof constraint === 'string') return this.#constraints.find(cons => cons.identifiesAs(constraint));
		this.#constraints = this.$castInputs([constraint], this.constructor.CONSTRAINT_TYPES, this.#constraints, 'constraints');
		return this;
	}

	index(index) {
		if (typeof index === 'string') return this.#indexes.find(idx => idx.identifiesAs(index));
		this.#indexes = this.$castInputs([index], IndexSchema, this.#indexes, 'indexes');
		return this;
	}

	/* -- TRAVERSALS */

	columns(asInstances = true) {
		const columns = this.#columns;
		return !asInstances ? columns.map(c => c.name()) : columns;
	}

	constraints(asInstances = true, deeply = true) {
		const constraints = !deeply ? this.#constraints : [...this.#nodes].filter(node => node instanceof AbstractLevel2Constraint);
		return !asInstances ? constraints.map(c => c.columns()) : constraints;
	}

	indexes(asInstances = true) {
		const indexes = this.#indexes;
		return !asInstances ? indexes.map(i => i.columns()) : indexes;
	}

	primaryKey(asInstances = true, deeply = true) {
		const pk = (!deeply ? this.#constraints : [...this.#nodes]).find(node => node.TYPE === 'PRIMARY_KEY');
		return !asInstances ? pk.columns() : pk;
	}

	foreignKeys(asInstances = true, deeply = true) {
		const fks = (!deeply ? this.#constraints : [...this.#nodes]).filter(node => node.TYPE === 'FOREIGN_KEY');
		return !asInstances ? fks.map(fk => fk.columns()) : fks;
	}

	uniqueKeys(asInstances = true, deeply = true) {
		const uks = (!deeply ? this.#constraints : [...this.#nodes]).filter(node => node.TYPE === 'UNIQUE_KEY');
		return !asInstances ? uks.map(uk => uk.columns()) : uks;
	}

	checks(asInstances = true, deeply = true) {
		const cks = (!deeply ? this.#constraints : [...this.#nodes]).filter(node => node.TYPE === 'CHECK');
		return !asInstances ? cks.map(ck => ck.expr()) : cks;
	}

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		const dirtyCheck = super.dirtyCheck(deeply);
		if (!deeply) return dirtyCheck;
		return dirtyCheck.concat(['columns', 'constraints', 'indexes'].filter((key) => {
			return this[key]().some(node => node.dirtyCheck(deeply).length);
		}));
	}

	renderCDL(tableCDL, options = {}) {
		const { rootCDL, ...$options } = options;
		const $$transforms = new Map;
		const $$additions = new Map;
		// ------------------------------------
		// -- NODE FINDER
		const findNode = (kind, name, assertExists = true, autoRehydrate = true) => {
			const $$kind = [].concat(kind);
			const Type = $$kind.includes('COLUMN') ? ColumnSchema : ($$kind.includes('INDEX') ? IndexSchema : AbstractLevel2Constraint);
			const node = [...this.#nodes].find(node => node instanceof Type && (
				node.identifiesAs(name) || (!name && this.params.dialect === 'mysql' && $$kind.includes('PRIMARY_KEY'))
			));
			if ((!node || ($$transforms.has(node) && !$$transforms.get(node)/*dropped*/)) && assertExists) {
				throw new Error(`${$$kind[0]}${name ? ` "${name}"` : ''} does not exist.`);
			}
			if (autoRehydrate && $$transforms.has(node)) return [node, node.constructor.fromJSON(node.contextNode, $$transforms.get(node))];
			return [node];
		};
		// -- ADD|MODIFY|CHANGE ACTION
		const handlePutCD = (cd) => {
			let placement = `${cd.KIND}:LAST`;
			if (cd.after()) {
				[placement] = findNode(cd.KIND, cd.after().name(), true, false);
			} else if (cd.first()) placement = `${cd.KIND}:FIRST`;
			if (!$$additions.has(placement)) $$additions.set(placement, []);
			// Modify and Change...
			if (['MODIFY', 'CHANGE'].includes(cd.CLAUSE)) {
				const [refNode, $refNode] = findNode(cd.KIND, cd.CLAUSE === 'CHANGE' ? cd.reference().name() : cd.argument().name());
				const $argument = ($refNode || refNode).generateDiff(cd.argument(), $options);
				$$additions.get(placement).unshift($argument);
				return;
			}
			// Addition...
			const [existing] = findNode(cd.KIND, cd.argument().name(), false, false);
			if (existing) {
				if ($$transforms.has(existing) || (!$$transforms.get(existing) || $$transforms.get(existing).status === 'obsolete')) {
					// This was a drop/re-add event. typically applicable to constraints
					$$transforms.set(existing, cd.argument().jsonfy($options));
					return;
				}
				if (cd.hasFlag('IF_NOT_EXISTS')) return;
				throw new Error(`${cd.KIND} ${cd.argument()?.name() || cd.$KIND} already exists`);
			}
			let $argument = cd.argument().jsonfy($options);
			if ($options.diff !== false) $argument = { ...$argument, status: 'new' };
			// Move into a column?
			if (cd.KIND === 'CONSTRAINT' && $argument.columns.length === 1) {
				const [refNode, $refNode] = findNode('COLUMN', $argument.columns[0], false) || [];
				if (refNode) {
					const $$refNode = $refNode || ColumnSchema.fromJSON(this, refNode.jsonfy($options));
					const $$argument = $$refNode.constraint($argument).jsonfy($options);
					$$transforms.set(refNode, $$argument);
				} else $$additions.get(placement).unshift($argument);
			} else $$additions.get(placement).unshift($argument);
		};
		// -- DROP ACTION
		const handleDropCD = (cd) => {
			const [refNode, $refNode] = findNode([cd.KIND, cd.$KIND], cd.reference().name(), !cd.hasFlag('IF_EXISTS'), $options.diff !== false);
			if (refNode) $$transforms.set(refNode, $options.diff === false ? undefined : { ...($refNode || refNode).jsonfy($options), status: 'obsolete' });
		};
		// -- SET ACTION
		const handleSetCD = (cd) => { };
		// -- RENAME
		const handleRenameCD = (cd) => {
			const [refNode, $refNode] = findNode([cd.KIND, cd.$KIND], cd.reference().name());
			const $argument = this.diffMergeJsons(($refNode || refNode).jsonfy($options), cd.argument().jsonfy($options), $options);
			$$transforms.set(refNode, $argument);
		};
		// -- ALTER ACTION
		const handleAlterCD = (cd) => {
			const [refNode, $refNode] = findNode(cd.KIND, cd.reference().name());
			const $json = ($refNode || refNode).renderCDL(cd.argument(), $options);
			$$transforms.set(refNode, $json);
		};
		// -- NODE RENDERING
		const renderNode = (node) => {
			const rejsonfyColumn = (col) => {
				// Ignore physically dropped
				if (!$$transforms.get(col)) return;
				const $col = col.constructor.fromJSON(col, $$transforms.get(col));
				for (const cons of col.constraints()) {
					if (!$$transforms.has(cons)) continue;
					if ($$transforms.get(cons)) $col.constraint($$transforms.get(cons));
					else $col.constraint(cons.TYPE, false); // Physically dropped
				}
				return $col.jsonfy({ tableCDL, ...options });
			};
			const rejsonfyNode = (cons) => {
				// Ignore physically dropped or no need to rehydrate if not options.rootCDL
				if (!options.rootCDL || !$$transforms.get(cons)) return $$transforms.get(cons);
				return cons.constructor.fromJSON(cons.contextNode, $$transforms.get(cons)).jsonfy({ tableCDL, ...options })
			};
			let $json;
			if ($$transforms.has(node)) {
				$json = node instanceof ColumnSchema ? rejsonfyColumn(node) : rejsonfyNode(node);
			} else if (node instanceof ColumnSchema) {
				$json = node.jsonfy($options, {}, (cons) => {
					return $$transforms.has(cons) ? rejsonfyNode(cons) : cons.jsonfy({ tableCDL, ...options })
				});
			} else $json = node.jsonfy({ tableCDL, ...options });
			return $json;
		};
		// -- SUBTREE RENDERING
		const renderSubtree = (nodes, kind) => {
			const $jsons = nodes.reduce((jsons, node) => {
				return jsons.concat(renderNode(node) || [], $$additions.get(node) || []);
			}, $$additions.get(`${kind}:FIRST`) || []);
			return $jsons.concat(($$additions.get(`${kind}:LAST`) || []).reverse());
		};
		// ------------------------------------
		// -- MAIN CDL RUNNER
		let outputJson = super.jsonfy($options);
		const ensurePrefix = (outputJson) => {
			if (!outputJson.prefix) outputJson = { ...outputJson, prefix: this.prefix(true).jsonfy($options) };
			return outputJson;
		};
		for (const cd of tableCDL) {
			if (['ADD', 'MODIFY', 'CHANGE'].includes(cd.CLAUSE)) {
				handlePutCD(cd);
			} else if (cd.CLAUSE === 'DROP') {
				handleDropCD(cd);
			} else if (cd.CLAUSE === 'SET') {
				if (cd.KIND === 'SCHEMA') {
					const $argument = cd.argument().jsonfy($options);
					outputJson = this.diffMergeJsons(ensurePrefix(outputJson), { prefix: $argument }, $options);
				} else handleSetCD(cd);
			} else if (cd.CLAUSE === 'RENAME') {
				if (!cd.KIND) {
					const $argument = cd.argument().jsonfy($options);
					outputJson = this.diffMergeJsons(ensurePrefix(outputJson), $argument, $options);
				} else handleRenameCD(cd);
			} else if (cd.CLAUSE === 'ALTER') {
				handleAlterCD(cd);
			} else throw new Error(`Unsupported operation: ${cd.CLAUSE} ${cd.KIND}`);
		}
		const columnTransforms = renderSubtree(this.#columns, 'COLUMN');
		const constraintTransforms = renderSubtree(this.#constraints, 'CONSTRAINT');
		const indexTransforms = renderSubtree(this.#indexes, 'INDEX');
		return { ...outputJson, columns: columnTransforms, constraints: constraintTransforms, indexes: indexTransforms };
	}

	generateCDL(options = {}) {
		const tableCDL = TableCDL.fromJSON(this, { actions: [] });
		const tblDirtyCheck = this.dirtyCheck();
		if (tblDirtyCheck.includes('name')) {
			tableCDL.add('RENAME', null, (cd) => cd.argument(this.$name()));
		}
		if (tblDirtyCheck.includes('prefix')) {
			tableCDL.add('SET', 'SCHEMA', (cd) => cd.argument(this.$prefix().jsonfy()));
		}
		for (const node of this.#nodes) {
			const kind = node instanceof AbstractLevel2Constraint
				? 'CONSTRAINT' : (node instanceof IndexSchema ? 'INDEX' : 'COLUMN');
			const $kind = kind !== 'COLUMN' && node.TYPE;
			let nodeDirtyCheck = _difference(node.dirtyCheck(), node.CDLIgnoreList());
			if (node.status() === 'new') {
				tableCDL.add('ADD', kind, $kind, (cd) => {
					cd.argument(node.jsonfy({ withColumns: kind !== 'COLUMN', diff: false }));
					if (kind === 'COLUMN' && options.ifNotExists) cd.withFlag('IF_NOT_EXISTS');
				});
			} else if (node.status() === 'obsolete') {
				tableCDL.add('DROP', kind, $kind, (cd) => {
					cd.reference(node.name());
					if (options.cascade) cd.withFlag('CASCADE');
				});
			} else/* existing */ {
				const nodeCDL = node.generateCDL();
				if (kind === 'COLUMN' && this.params.dialect === 'mysql' && !(nodeCDL.length === 1 && nodeCDL.actions()[0].KIND === 'DEFAULT')) {
					tableCDL.add('MODIFY', 'COLUMN', (cd) => cd.argument(node.jsonfy(options, {}, (cons) => cons.constraintLevel === 1 ? cons : false)));
				} else if (nodeCDL.length) {
					tableCDL.add('ALTER', kind, $kind, (cd) => { cd.reference(node.name()); cd.argument(nodeCDL); });
				} else if (kind !== 'COLUMN' && (nodeDirtyCheck.length > 1 || nodeDirtyCheck.length === 1 && nodeDirtyCheck[0] !== 'name')) {
					tableCDL.add('DROP', kind, $kind, (cd) => cd.reference(node.name()));
					tableCDL.add('ADD', kind, $kind, (cd) => cd.argument(node.jsonfy({ withColumns: true })));
					nodeDirtyCheck = nodeDirtyCheck.filter(s => s !== 'name');
				}
			}
			// This should come last as nodeDirtyCheck might be need to be mutated
			if (nodeDirtyCheck.includes('name')) {
				tableCDL.add('RENAME', kind, $kind, (cd) => { cd.reference(node.name()); cd.argument(node.$name()); });
			}
		}
		return tableCDL;
	}

	generateDiff(nodeB, options) {
		const outputJson = super.generateDiff(nodeB, options);
		// Normalise constraints and process subtree...
		const modifiedColumns = new Map;
		const [constraintsA, constraintsB] = [new Map, new Map];
		for (const [instance, constraints] of [[this, constraintsA], [nodeB, constraintsB]]) {
			for (const cons of instance.constraints(true, false)) {
				let refColumn;
				if (cons.columns().length === 1 && (refColumn = instance.column(cons.columns()[0]))) {
					const $refColumn = modifiedColumns.get(refColumn) || refColumn.clone();
					$refColumn.constraint(cons.jsonfy(options));
					modifiedColumns.set(refColumn, $refColumn);
				} else constraints.set(cons.name().toLowerCase(), cons);
			}
		}
		const columnsDiff = this.diffMergeTrees(this.#columns, nodeB.columns(), (a, b) => (modifiedColumns.get(a) || a).generateDiff((modifiedColumns.get(b) || b), options), options);
		const constraintsDiff = this.diffMergeTrees(constraintsA, constraintsB, (a, b) => a.generateDiff(b, options), options);
		const indexesDiff = this.diffMergeTrees(this.#indexes, nodeB.indexes(), (a, b) => a.generateDiff(b, options), options);
		return { ...outputJson, columns: columnsDiff, constraints: constraintsDiff, indexes: indexesDiff };
	}

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.columns) || ['constraints', 'indexes'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJSON(context, json, (instance) => {
			for (const col of json.columns) instance.column(col);
			for (const cons of (json.constraints || [])) instance.constraint(cons);
			for (const idx of (json.indexes || [])) instance.index(idx);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			columns: this.#columns.map(col => col.jsonfy(options)),
			constraints: this.#constraints.map(cons => cons.jsonfy(options)).filter(c => c),
			indexes: this.#indexes.map(idx => idx.jsonfy(options)).filter(c => c),
			...jsonIn
		});
	}

	static parse(context, expr, parseCallback) {
		const [namePart, bodyPart, ...rest] = Lexer.split(expr, [], { limit: 2 });
		if (!namePart || !_wrapped(bodyPart || '', '(', ')')) return;
		const instance = new this(context);
		const [name, prefix] = this.parseIdent(instance, namePart.trim()).reverse();
		instance.name(name);
		if (prefix) instance.prefix(prefix);
		const defs = Lexer.split(_unwrap(bodyPart, '(', ')'), [',']).map(def => {
			return parseCallback(instance, def.trim(), [...this.CONSTRAINT_TYPES, IndexSchema, ColumnSchema]); // Note that ColumnSchema must come last
		});
		for (const def of defs) {
			if (def instanceof ColumnSchema) instance.column(def);
			else if (def instanceof IndexSchema) instance.index(def);
			else instance.constraint(def);
		}
		return instance;
	}

	stringify() {
		const defs = [this.#columns.map(col => col.stringify()).join(',\n\t')];
		const constraints = this.#constraints.slice(0);
		const indexes = this.#indexes.slice(0);
		if (this.params.dialect === 'mysql') {
			constraints.push(...this.#columns.reduce((constraints, col) => {
				const constraint = col.foreignKey();
				if (constraint) return constraints.concat(ForeignKeyConstraint.fromJSON(this, { ...constraint.jsonfy(), columns: [col.name()] }));
				return constraints;
			}, []));
		}
		if (constraints.length) { defs.push(constraints.map(cnst => cnst.stringify()).join(',\n\t')); }
		if (indexes.length) { defs.push(indexes.map(ndx => ndx.stringify()).join(',\n\t')); }
		return `${GlobalTableRef.fromJSON(this, [this.$prefix(true), this.$name()])} (\n\t${defs.join(',\n\t')}\n)`;
	}
}