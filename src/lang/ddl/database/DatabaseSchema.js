import { AbstractNameableNode } from '../abstracts/AbstractNameableNode.js';
import { TableSchema } from '../table/TableSchema.js';
import { DatabaseCDL } from './DatabaseCDL.js';

export class DatabaseSchema extends AbstractNameableNode {

	#version;
	#tables = [];

	[Symbol.iterator]() { return this.#tables[Symbol.iterator](); }

	get length() { return this.#tables.length; }

	$capture(requestName, requestSource) {
		if (['DATABASE_SCHEMA'].includes(requestName)) return this;
		return super.$capture(requestName, requestSource);
	}

	/* -- SUBTREE I/O */

	version() { return this.#version; }

	table(arg1, ...args) {
		if (typeof arg1 === 'string') {
			const existing = this.#tables.find((tbl) => tbl.identifiesAs(arg1));
			if (!args.length) return existing;
			if (args[0] === false) {
				this.#tables = this.#tables.filter((t) => t !== existing);
				existing?.bubble('DISCONNECTED');
				return this;
			}
			arg1 = { name: arg1, ...(typeof args[0] === 'object' ? args[0] : { columns: args[0] }) };
		}
		this.#tables = this.$castInputs([arg1], TableSchema, this.#tables, 'tables', null, (existing) => {
			return this.#tables.find((tbl) => tbl.identifiesAs(existing.name()));
		});
		return this;
	}

	/* -- TRAVERSALS */

	tables(asInstances = true) {
		if (asInstances) return this.#tables;
		return this.#tables.reduce((tbls, tbl) => tbls.concat(tbl.name()), []);
	}

	columns(asInstances = true) {
		return this.#tables.reduce((cols, tbl) => {
			return cols.concat(!asInstances ? tbl.columns(false).map(name => [tbl.name(), name]) : tbl.columns());
		}, []);
	}

	primaryKeys(asInstances = true, deeply = true) {
		return this.#tables.reduce((cols, tbl) => {
			return cols.concat(!asInstances ? [[tbl.name(), tbl.primaryKeys(false, deeply)/*cols*/]] : tbl.primaryKey(true, deeply));
		}, []);
	}

	foreignKeys(asInstances = true, deeply = true) {
		return this.#tables.reduce((cols, tbl) => {
			return cols.concat(!asInstances ? tbl.foreignKeys(false, deeply).map(cols => [tbl.name(), cols]) : tbl.foreignKeys(true, deeply));
		}, []);
	}

	uniqueKeys(asInstances = true, deeply = true) {
		return this.#tables.reduce((cols, tbl) => {
			return cols.concat(!asInstances ? tbl.uniqueKeys(false, deeply).map(cols => [tbl.name(), cols]) : tbl.uniqueKeys(true, deeply));
		}, []);
	}

	checks(asInstances = true, deeply = true) {
		return this.#tables.reduce((cols, tbl) => {
			return cols.concat(!asInstances ? tbl.checks(false, deeply).map(expr => [tbl.name(), expr]) : tbl.checks(true, deeply));
		}, []);
	}

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		const dirtyCheck = super.dirtyCheck(deeply);
		if (!deeply) return dirtyCheck;
		return dirtyCheck.concat(['tables'].filter((key) => {
			return this[key]().some(node => node.dirtyCheck(deeply).length);
		}));
	}

	renderCDL(databaseCDL, options) {
		const { rootCDL, ...$options } = options;
		const $$hasSeenRootCDL = new Set;
		const $$transforms = new Map;
		const $$additions = [];
		// ------------------------------------
		// -- NODE FINDER
		const findTable = (name, assertExists = true, autoRehydrate = true) => {
			const node = this.table(name);
			if ((!node || ($$transforms.has(node) && !$$transforms.get(node)/*dropped*/)) && assertExists) {
				throw new Error(`Table "${this.name()}"."${name}" does not exist.`);
			}
			if (autoRehydrate && $$transforms.has(node)) return [node, node.constructor.fromJSON(node.contextNode.clone(), $$transforms.get(node))];
			return [node];
		};
		const getOptionsFor = (node) => {
			const $$options = { ...$options, rootCDL: !$$hasSeenRootCDL.has(node) && rootCDL };
			if (!$$hasSeenRootCDL.has(node)) $$hasSeenRootCDL.add(node);
			return $$options;
		};
		// -- ADD|MODIFY|CHANGE ACTION
		const handleCreateCD = (cd) => {
			if (findTable(cd.argument().name(), false, false)[0]) {
				if (cd.hasFlag('IF_NOT_EXISTS')) return;
				throw new Error(`Table "${cd.argument()?.name()}" already exists`);
			}
			let $argument = cd.argument().jsonfy($options);
			if ($options.diff) $argument = { ...$argument, status: 'new' };
			$$additions.push($argument);
		};
		// -- DROP ACTION
		const handleDropCD = (cd) => {
			const [refNode, $refNode] = findTable(cd.reference().name(), !cd.hasFlag('IF_EXISTS'), !!$options.diff);
			if (refNode) $$transforms.set(refNode, !$options.diff ? undefined : { ...($refNode || refNode).jsonfy($options), status: 'obsolete' });
		};
		// -- SET ACTION
		const handleSetCD = (cd) => { };
		// -- RENAME
		const handleRenameCD = (cd) => {
			const [refNode, $refNode] = findTable(cd.reference().name());
			const $argument = this.diffMergeJsons(($refNode || refNode).jsonfy(getOptionsFor(refNode)), cd.argument().jsonfy($options), $options);
			$$transforms.set(refNode, $argument);
		};
		// -- ALTER ACTION
		const handleAlterCD = (cd) => {
			const [refNode, $refNode] = findTable(cd.reference().name());
			const $json = ($refNode || refNode).renderCDL(cd.argument(), getOptionsFor(refNode));
			$$transforms.set(refNode, $json);
		};
		// -- NODE RENDERING
		const renderNode = (node) => {
			let $json;
			const $$options = getOptionsFor(node);
			if ($$transforms.has(node)) {
				// Ignore physically dropped
				if (!$$transforms.get(node)) return;
				if ($$options.rootCDL) {
					$json = node.constructor.fromJSON(this.clone(), $$transforms.get(node)).jsonfy($$options);
				} else $json = $$transforms.get(node);
			} else $json = node.jsonfy($$options);
			return $json;
		};
		// -- SUBTREE RENDERING
		const renderSubtree = (nodes) => {
			return nodes.reduce((jsons, node) => {
				return jsons.concat(renderNode(node) || []);
			}, []).concat($$additions);
		};
		// ------------------------------------
		// -- MAIN CDL RUNNER
		let outputJson = super.jsonfy($options);
		for (const cd of databaseCDL) {
			if (cd.CLAUSE === 'CREATE') {
				handleCreateCD(cd);
			} else if (cd.CLAUSE === 'DROP') {
				handleDropCD(cd);
			} else if (cd.CLAUSE === 'SET') {
				handleSetCD(cd);
			} else if (cd.CLAUSE === 'RENAME') {
				if (!cd.KIND) {
					const $argument = cd.argument().jsonfy($options);
					outputJson = this.diffMergeJsons(outputJson, $argument, $options);
				} else handleRenameCD(cd);
			} else if (cd.CLAUSE === 'ALTER') {
				handleAlterCD(cd);
			} else throw new Error(`Unsupported operation: ${cd.CLAUSE} ${cd.KIND}`);
		}
		return { ...outputJson, tables: renderSubtree(this.#tables) };
	}

	generateCDL(options = {}, kind = 'TABLE'/*or: VIEW*/) {
		const databaseCDL = DatabaseCDL.fromJSON(this, { actions: [] });
		const tblDirtyCheck = this.dirtyCheck();
		if (tblDirtyCheck.includes('name')) {
			databaseCDL.add('RENAME', null, (cd) => cd.argument(this.$name()));
		}
		for (const tbl of this.#tables) {
			if (tbl.status() === 'new') {
				databaseCDL.add('CREATE', kind, (cd) => {
					cd.argument({ prefix: this.name(), ...tbl.jsonfy({ ...options, diff: false }) });
					if (options.existsChecks) cd.withFlag('IF_NOT_EXISTS');
				});
			} else if (tbl.status() === 'obsolete') {
				databaseCDL.add('DROP', kind, (cd) => {
					cd.reference([this.name(), tbl.name()]);
					if (options.cascadeRule) cd.withFlag(options.cascadeRule);
					if (options.existsChecks) cd.withFlag('IF_EXISTS');
				});
			} else {
				const tblCDL = tbl.generateCDL(options);
				if (tblCDL.length) databaseCDL.add('ALTER', kind, (cd) => {
					cd.reference([this.name(), tbl.name()]);
					cd.argument(tblCDL);
				});
			}
		}
		return databaseCDL;
	}

	generateDiff(nodeB, options) {
		const outputJson = super.generateDiff(nodeB, options);
		const tablesDiff = this.diffMergeTrees(this.#tables, nodeB.tables(), (a, b) => a.generateDiff(b, options), options);
		return { ...outputJson, tables: tablesDiff };
	}

	/* -- UTILS */

	findPrefix(name) { return this.tables().find(tbl => tbl.column(name))?.name(); }

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		if (('tables' in (json || {}) && !Array.isArray(json.tables))) return;
		return super.fromJSON(context, json, (instance) => {
			for (const tbl of json.tables || []) instance.table(tbl);
			if (typeof json.version === 'number') instance.#version = json.version;
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			...(typeof this.#version === 'number' ? { version: this.#version } : {}),
			tables: this.#tables.map(table => table.jsonfy(options)),
			...jsonIn,
		});
	}

	static parse(context, expr, parseCallback) {
		const [name] = this.parseIdent(context, expr);
		if (!name) return;
		return (new this(context)).name(name);
	}

	stringify() { return this.stringifyIdent(this.$name()); }
}