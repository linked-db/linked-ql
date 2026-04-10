import { ConflictError } from '../../errors/ConflictError.js';

export class NamespaceDDL {

    #tx;
    #isCreate;
    #bumpLevel = 0;

    // ------

    #id;
    #name;
    #kind;
    #owner;
    #view_opts_default_replication_origin;
    #engine_attrs;

    #version_major;
    #version_minor;
    #version_patch;

    // ------ getters

    get id() { return this.#id; }
    get name() { return this.#name; }
    get kind() { return this.#kind; }
    get owner() { return this.#owner; }
    get view_opts_default_replication_origin() { return this.#view_opts_default_replication_origin; }
    get engine_attrs() { return this.#engine_attrs; }

    get version_major() { return this.#version_major; }
    get version_minor() { return this.#version_minor; }
    get version_patch() { return this.#version_patch; }

    // ------ constructor

    constructor(tx, {
        id = null,
        name = null,
        kind = null,
        owner = null,
        view_opts_default_replication_origin = null,
        engine_attrs = null,
        version_major = 1,
        version_minor = 0,
        version_patch = 0,
        ...unexpected
    } = {}) {
        if ((unexpected = Object.keys(unexpected)).length)
            throw new Error(`Unexpected inputs: ${unexpected.join(', ')}`);

        this.#tx = tx;
        this.#isCreate = !id;

        this.#id = id;
        this.#name = name;
        this.#kind = kind;
        this.#owner = owner;
        this.#view_opts_default_replication_origin = view_opts_default_replication_origin;
        this.#engine_attrs = engine_attrs;

        this.#version_major = version_major;
        this.#version_minor = version_minor;
        this.#version_patch = version_patch;
    }

    setName(value) {
        if (!/^[a-zA-Z_]/.test(value))
            throw new Error(`Namespace name must start with a letter or underscore`);

        const sysNs = this.#tx.getRelation({ namespace: 'sys', name: 'sys_namespaces' });
        const existing = sysNs.get({ name: value }, { using: 'sys_namespaces__name_idx' });
        if (existing)
            throw new ConflictError(`Namespace ${JSON.stringify(value)} already exists`, existing);

        const prevName = this.#name;
        this.#name = value;

        if (prevName && prevName !== value) {
            // Identity change
            this.#bumpLevel = Math.max(this.#bumpLevel, 3);
        }
    }

    setKind(value) {
        if (!['schema'].includes(value))
            throw new Error(`Invalid namespace kind setting ${value}`);
        if (this.#kind && this.#kind !== value)
            throw new Error(`Cannot change namespace kind to ${value}`);
        this.#kind = value;
    }

    setOwner(value) {
        if (!/^[a-zA-Z_]/.test(value))
            throw new Error(`Namespace owner must start with a letter or underscore`);
        this.#owner = value;
    }

    setEngineAttrs(value = null) {
        // Can be reset to null
        if (value !== null) {
            if (typeof value !== 'object')
                throw new SyntaxError(`engine_attrs must be an object`);

            const attrKeys = Object.keys(value);
            if (attrKeys.length) throw new SyntaxError(`Unexpected attributes: ${attrKeys.map((k) => `engine_attrs.${k}`).join(', ')}`);
        }

        this.#engine_attrs = value;
    }

    setViewOptsDefaultReplicationOrigin(value = null) {
        // Can be reset to null
        if (value !== null) {
            if (typeof value !== 'string')
                throw new SyntaxError(`View replication origin type must be string. Got type ${typeof value}`);

            if (!/^(postgres|mysql|flashql)\:/.test(value))
                throw new SyntaxError(`View default replication origin must either start with the origin-type scheme: "postgres:", "mysql:", or "flashql:" or be the keyword: "inherit"`);
        }

        if (this.#view_opts_default_replication_origin !== value) {
            this.#view_opts_default_replication_origin = value;

            // Can be structural change
            this.#bumpLevel = Math.max(this.#bumpLevel, 1);
        }
    }

    // ------

    async apply(input, { ifNotExists = false } = {}) {
        // ------------- Identity

        if (this.#isCreate || ![null, undefined].includes(input.name) && input.name !== this.#name) {
            try { this.setName(input.name); } catch (e) {
                if (e instanceof ConflictError && ifNotExists) return {};
                throw e;
            }
        }

        // ------------- Attributes

        if (![null, undefined].includes(input.kind))
            this.setKind(input.kind);

        if (![null, undefined].includes(input.owner))
            this.setOwner(input.owner);

        if (input.view_opts_default_replication_origin !== undefined)
            this.setViewOptsDefaultReplicationOrigin(input.view_opts_default_replication_origin);

        if (input.engine_attrs !== undefined)
            this.setEngineAttrs(input.engine_attrs);

        // ------------- Versioning

        if (this.#bumpLevel) {
            const record = this.#tx._versioningCache.get(this.#id) || {
                base: {
                    version_major: this.#version_major,
                    version_minor: this.#version_minor,
                    version_patch: this.#version_patch,
                },
                level: 0,
            };
            record.level = Math.max(record.level, this.#bumpLevel);
            this.#tx._versioningCache.set(this.#id, record);

            if (record.level >= 3) {
                this.#version_major++;
                this.#version_minor = 0;
                this.#version_patch = 0;
            } else if (record.level === 2) {
                this.#version_minor++;
                this.#version_patch = 0;
            } else {
                this.#version_patch++;
            }
        }

        return {
            id: this.#id,
            name: this.#name,
            kind: this.#kind,
            owner: this.#owner,
            view_opts_default_replication_origin: this.#view_opts_default_replication_origin,

            //version_major: this.#version_major,
            //version_minor: this.#version_minor,
            //version_patch: this.#version_patch,

            engine_attrs: this.#engine_attrs,
        };
    }
}
