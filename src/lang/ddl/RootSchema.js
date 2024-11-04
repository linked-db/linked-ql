import { DatabaseSchema } from './database/DatabaseSchema.js';
import { AbstractDiffableNode } from './abstracts/AbstractDiffableNode.js';
import { RootCDL } from './RootCDL.js';

export class RootSchema extends AbstractDiffableNode {

	#databases = [];

	[Symbol.iterator]() { return this.#databases[Symbol.iterator](); }

	get length() { return this.#databases.length; }

	$capture(requestName, requestSource) {
		if (requestName === 'ROOT_SCHEMA') return this;
		return super.$capture(requestName, requestSource);
	}

	/* -- SUBTREE I/O */

	database(arg1, ...args) {
		if (typeof arg1 === 'string') {
			const existing = this.#databases.find((db) => db.identifiesAs(arg1));
			if (!args.length) return existing;
			if (args[0] === false) {
				this.#databases = this.#databases.filter((d) => d !== existing);
				existing?.bubble('DISCONNECTED');
				return this;
			}
			arg1 = { name: arg1, ...(typeof args[0] === 'object' ? args[0] : { tables: args[0] }) };
		}
		this.#databases = this.$castInputs([arg1], DatabaseSchema, this.#databases, 'databases', null, (existing) => {
			return this.#databases.find((db) => db.identifiesAs(existing.name()));
		});
		return this;
	}

	/* -- TRAVERSALS */

	databases(asInstances = true) {
		if (asInstances) return this.#databases;
		return this.#databases.map(db => db.name());
	}

	tables(asInstances = true) {
		return this.#databases.reduce((tbls, db) => {
			return tbls.concat(!asInstances ? db.tables(false).map(tbl => [db.name(), ...tbl]) : db.tables());
		}, []);
	}

	columns(asInstances = true) {
		return this.#databases.reduce((cols, db) => {
			return cols.concat(!asInstances ? db.columns(false).map(col => [db.name(), ...col]) : db.columns());
		}, []);
	}

	primaryKeys(asInstances = true, deeply = true) {
		return this.#databases.reduce((fks, db) => {
			return fks.concat(!asInstances ? db.primaryKeys(false, deeply).map(pk => [db.name(), ...pk]) : db.primaryKeys(true, deeply));
		}, []);
	}

	foreignKeys(asInstances = true, deeply = true) {
		return this.#databases.reduce((fks, db) => {
			return fks.concat(!asInstances ? db.foreignKeys(false, deeply).map(fk => [db.name(), ...fk]) : db.foreignKeys(true, deeply));
		}, []);
	}

	uniqueKeys(asInstances = true, deeply = true) {
		return this.#databases.reduce((fks, db) => {
			return fks.concat(!asInstances ? db.uniqueKeys(false, deeply).map(uk => [db.name(), ...uk]) : db.uniqueKeys(true, deeply));
		}, []);
	}

	checks(asInstances = true, deeply = true) {
		return this.#databases.reduce((fks, db) => {
			return fks.concat(!asInstances ? db.checks(false, deeply).map(ck => [db.name(), ...ck]) : db.checks(true, deeply));
		}, []);
	}

	/* -- TRANSFORMS */

	renderCDL(rootCDL, options) {
		const $options = options;
		const $$hasSeenRootCDL = new Set;
		const $$transforms = new Map;
		const $$additions = [];
		// ------------------------------------
		// -- NODE FINDER
		const findDatabase = (name, assertExists = true, autoRehydrate = true) => {
			const node = this.database(name);
			if ((!node || ($$transforms.has(node) && !$$transforms.get(node)/*dropped*/)) && assertExists) {
				throw new Error(`Database "${name}" does not exist.`);
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
			if (findDatabase(cd.argument().name(), false, false)[0]) {
				if (cd.hasFlag('IF_NOT_EXISTS')) return;
				throw new Error(`Database "${cd.argument()?.name()}" already exists`);
			}
			let $argument = cd.argument().jsonfy($options);
			if ($options.diff !== false) $argument = { ...$argument, status: 'new' };
			$$additions.push($argument);
		};
		// -- DROP ACTION
		const handleDropCD = (cd) => {
			const [refNode, $refNode] = findDatabase(cd.reference().name(), !cd.hasFlag('IF_EXISTS'), $options.diff !== false);
			if (refNode) $$transforms.set(refNode, $options.diff === false ? undefined : { ...($refNode || refNode).jsonfy($options), status: 'obsolete' });
		};
		// -- RENAME
		const handleRenameCD = (cd) => {
			const [refNode, $refNode] = findDatabase(cd.reference().name());
			const $argument = this.diffMergeJsons(($refNode || refNode).jsonfy(getOptionsFor(refNode)), cd.argument().jsonfy($options), $options);
			$$transforms.set(refNode, $argument);
		};
		// -- ALTER ACTION
		const handleAlterCD = (cd) => {
			const [refNode, $refNode] = findDatabase(cd.reference().name());
			const $json = ($refNode || refNode).renderCDL(cd.argument(), getOptionsFor(refNode));
			$$transforms.set(refNode, $json);
		};
		// -- NODE RENDERING
		const renderNode = (db) => {
			let $json;
			const $$options = getOptionsFor(db);
			if ($$transforms.has(db)) {
				// Ignore physically dropped
				if (!$$transforms.get(db)) return;
				if ($$options.cascade && $$options.rootCDL) {
					$json = db.constructor.fromJSON(this, $$transforms.get(db)).jsonfy($$options);
				} else $json = $$transforms.get(db);
			} else $json = db.jsonfy($$options);
			return $json;
		};
		// -- SUBTREE RENDERING
		// ------------------------------------
		// -- MAIN CDL RUNNER
		for (const cd of rootCDL) {
			if (cd.CLAUSE === 'CREATE') {
				handleCreateCD(cd);
			} else if (cd.CLAUSE === 'DROP') {
				handleDropCD(cd);
			} else if (cd.CLAUSE === 'RENAME') {
				handleRenameCD(cd);
			} else if (cd.CLAUSE === 'ALTER') {
				handleAlterCD(cd);
			} else throw new Error(`Unsupported operation: ${cd.CLAUSE} ${cd.KIND}`);
		}
		return this.renderNormalized(this.#databases, renderNode).concat($$additions);
	}

	renderNormalized(dbs, renderCallback, forceNormalize = false) {
		const $matches = (dbName, prefix) => this.$eq(dbName, prefix?.name || prefix, 'ci');
		const [$$jsons, $$relocatingTables] = dbs.reduce(([$jsons, $relocatingTables], db) => {
			let $json = renderCallback(db);
			// Physically move tables?
			if ($json) {
				let _;
				// Exclude tables pointing to other DB
				$json = {
					...$json,
					tables: $json.tables.reduce((tbls, tbl) => {
						if (tbl.prefix) {
							if ($matches(db.name(), tbl.prefix)) {
								if (!tbl.$prefix) ({ prefix: _, ...tbl } = tbl);
							} else {
								const targetDB = $jsons.find(dbJson => $matches(dbJson.name, tbl.prefix));
								if (targetDB) {
									if (!tbl.$prefix) ({ prefix: _, ...tbl } = tbl);
									targetDB.tables.push(tbl);
								} else $relocatingTables.push({ db, tbl });
								return tbls;
							}
						}
						return tbls.concat(tbl);
					}, []),
				};
				// Include tables moving from other DBs
				$relocatingTables = $relocatingTables.reduce(($tbls, entry) => {
					let $tbl = entry.tbl;
					if ($matches(db.name(), $tbl.prefix)) {
						if (!$tbl.$prefix) ({ prefix: _, ...$tbl } = $tbl);
						$json.tables.push($tbl);
						return $tbls;
					}
					return $tbls.concat(entry);
				}, []);
			}
			return [$jsons.concat($json || []), $relocatingTables];
		}, [[], []]);
		if ($$relocatingTables.length) {
			if (forceNormalize) {
				for (const { tbl } of $$relocatingTables) {
					let $tbl = tbl, _;
					if (!$tbl.$prefix) ({ prefix: _, ...$tbl } = $tbl);
					const targetDB = $$jsons.find(dbJson => $matches(dbJson.name, tbl.prefix));
					if (targetDB) {
						targetDB.tables.push($tbl);
					} else $$jsons.push({
						name: tbl.prefix.name || tbl.prefix,
						tables: [$tbl],
					});
				}
			} else throw new Error(`The following tables could not be moved to the implied target database: ${$$relocatingTables.map((entry) => `"${entry.db.name()}"."${entry.tbl.name}" -> "${entry.tbl.prefix.name || entry.tbl.prefix}"."${entry.tbl.name}"`).join('", "')}`);
		}
		return $$jsons;
	}

	generateCDL(options = {}, kind = 'SCHEMA'/*or: DATABASE*/) {
		const rootCDL = RootCDL.fromJSON(this, { actions: [] });
		for (const db of this.#databases) {
			if (db.status() === 'new') {
				rootCDL.add('CREATE', kind, (cd) => {
					cd.argument(db.jsonfy({ ...options, diff: false }));
					if (options.ifNotExists) cd.withFlag('IF_NOT_EXISTS');
				});
			} else if (db.status() === 'obsolete') {
				rootCDL.add('DROP', kind, (cd) => {
					cd.reference(db.name());
					if (options.cascade) cd.withFlag('CASCADE');
				});
			} else {
				const dbCDL = db.generateCDL(options);
				if (dbCDL.length) rootCDL.add('ALTER', kind, (cd) => {
					cd.reference(db.name());
					cd.argument(dbCDL);
				});
			}
		}
		return rootCDL;
	}

	generateDiff(nodeB, options) {
		return this.diffMergeTrees(
			this.#databases,
			nodeB.databases(),
			(a, b) => a.generateDiff(b, options),
			options
		);
	}

	/* -- UTILS */

	defaultDB() { return this.databases(false)[0]; }

	findPrefix(name, defaultToFirst = false) {
		const path = this.tables(false).find(tbl => tbl[1].toLowerCase() === name.toLowerCase())?.[0];
		if (!path && defaultToFirst) return this.defaultDB();
		return path;
	}

	/* -- I/O */

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json)) return;
		return super.fromJSON(context, json, (instance) => {
			for (const db of json) instance.database(db);
			callback?.(instance);
		});
	}

	jsonfy(options = {}, jsonIn = {}) {
		return this.renderNormalized(this.#databases, (db) => db.jsonfy(options), options.forceNormalize);
	}
}