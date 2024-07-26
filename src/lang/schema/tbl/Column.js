
import Lexer from '../../Lexer.js';
import { _toCamel, _fromCamel } from '@webqit/util/str/index.js';
import AbstractNode from '../AbstractNode.js';
import AutoIncrement from './constraints/AutoIncrement.js';
import Expression from './constraints/Expression.js';
import Identity from './constraints/Identity.js';
import Default from './constraints/Default.js';
import NotNull from './constraints/NotNull.js';
import ColumnPrimaryKey from './constraints/ColumnPrimaryKey.js';
import ColumnForeignKey from './constraints/ColumnForeignKey.js';
import ColumnUniqueKey from './constraints/ColumnUniqueKey.js';
import CheckConstraint from './constraints/CheckConstraint.js';
import OnUpdate from './constraints/OnUpdate.js';
import Null from './constraints/Null.js';
import DataType from './DataType.js';

export default class Column extends AbstractNode {

    /**
	 * Instance properties
	 */
	TYPE;
	$TYPE;
	CONSTRAINTS = [];

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['TYPE'].concat(super.WRITABLE_PROPS); }
	static get SUBTREE_PROPS() { return ['CONSTRAINTS']; }

    /**
     * @var Array
     */
    static CONSTRAINT_TYPES = [AutoIncrement,Identity,Expression,Default,NotNull,Null,OnUpdate,ColumnPrimaryKey,ColumnForeignKey,ColumnUniqueKey,CheckConstraint];

	/**
	 * Sets the column type,
	 * 
	 * @param DataType|Object value
	 * 
	 * @returns this
	 */
	type(value) {
        if (!arguments.length) return this[this.smartKey('TYPE')];
        return (this.build(this.smartKey('TYPE', true), [value], DataType), this);
    }

    /**
     * AUTO_INCREMENT
     */
    autoIncrement(...args) { return this.constraint('AUTO_INCREMENT', ...args); }

    /**
     * IDENTITY
     */
    identity(...args) { return this.constraint('IDENTITY', ...args); }

    /**
     * EXPRESSION
     */
    expression(...args) { return this.constraint('EXPRESSION', ...args); }

    /**
     * DEFAULT
     */
    default(...args) { return this.constraint('DEFAULT', ...args); }

    /**
     * NOT_NULL
     */
    notNull(...args) { return this.constraint('NOT_NULL', ...args); }

    /**
     * NULL
     */
    null(...args) { return this.constraint('NULL', ...args); }

    /**
     * ON_UPDATE
     */
    onUpdate(...args) { return this.constraint('ON_UPDATE', ...args); }

    /**
     * PRIMARY_KEY
     */
    primaryKey(...args) { return this.constraint('PRIMARY_KEY', ...args); }

    /**
     * FOREIGN_KEY
     */
    foreignKey(...args) { return this.constraint('FOREIGN_KEY', ...args); }

    /**
     * UNIQUE_KEY
     */
    uniqueKey(...args) { return this.constraint('UNIQUE_KEY', ...args); }

    /**
     * CHECK
     */
    check(...args) { return this.constraint('CHECK', ...args); }

	/**
	 * Adds a column-level constraint to the column,
	 * 
	 * @param String type
	 * @param Any value
	 * 
	 * @returns this
	 */
	constraint(arg1, ...args) {
        let existing, getExisting = type => this.CONSTRAINTS.find(cons => cons.TYPE === type);;
        if (typeof arg1 === 'string') {
            existing = getExisting(arg1);
            if (!args.length) return existing;
            else if (args[0] === false) return existing?.drop();
            arg1 = { type: arg1, ...(typeof args[0] === 'object' ? args[0] : (typeof args[0] === 'string' ? { expr: args[0] } : {})) };
        } else if (!(arg1 instanceof AbstractNode)) existing = getExisting(arg1.type);
        if (existing) {
            const instance = this.constructor.CONSTRAINT_TYPES.reduce((prev, Type) => prev || Type.fromJson(this, arg1));
            existing.diffWith(instance);
        } else this.build('CONSTRAINTS', [arg1], this.constructor.CONSTRAINT_TYPES);
        return this;
    }

    /**
	 * Merges in new changes from another column instance,
	 * 
	 * @param Column columnB
	 * 
	 * @returns Void
	 */
    diffWith(nodeB) {
        super.diffWith(nodeB);
        const typeA = this.type().toJson(), typeB = nodeB.type().toJson();
        if (!this.isSame(typeA, typeB)) this.type(typeB);
        for (const type of ['IDENTITY', 'EXPRESSION', 'NOT_NULL', 'DEFAULT', 'AUTO_INCREMENT', 'ON_UPDATE']) {
            const consA = this.constraint(type);
            const consB = nodeB.constraint(type);
            if (consA && (!consB || consB.dropped())) consA.drop();
            else if (!consA && consB && !consB.dropped()) this.constraint(consB.toJson());
            else if (consA && consB) consA.diffWith(consB);
        }
		return this;
    }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
        let json = {
            type: this.TYPE.toJson(),
            ...(this.$TYPE ? { $type: this.$TYPE.toJson() } : {}),
        };
        for (const cons of this.CONSTRAINTS) {
            const { type, ...constraintDef } = cons.toJson();
            const propName = type === 'FOREIGN_KEY' ? 'references' : _toCamel(type.toLowerCase().replace('_', ' '));
            const props = Object.keys(constraintDef);
            const lonePropValue = props.length === 1 ? constraintDef[props[0]] : null;
            const propValue = !props.length ? true : (lonePropValue === false && props[0] === 'keep' ? false : (props.length === 1 && props[0] === 'expr' ? lonePropValue : constraintDef));
            json = { ...json, [ propName ]: propValue };
        }
        return { ...json, ...super.toJson()/** Status */ };
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
        const { type, $type, name: _, $name: __, keep: ___, ...constraints } = json;
        if (!DataType.fromJson({}, type)) return;
        return super.fromJson(context, json, () => {
			const instance = new this(context);
            instance.type(DataType.fromJson(instance, type));
            instance.hardSet($type, val => instance.type(DataType.fromJson(instance, val)));
            const constraintsNormalized = Object.entries(constraints).reduce((normalized, [name, value]) => {
                if ([undefined,null].includes(value)) return normalized;
                if (!['boolean','number','string'].includes(typeof value) && !(typeof value === 'object' && value)) {
                    throw new Error(`Invalid value for constraint "${ name }": ${ value }`);
                }
                let cons = { ...(value === false ? { keep: false } : (value === true ? {} : (['number','string'].includes(typeof value) ? { expr: value } : value))) };
                if (name.startsWith('$')) {
                    cons = Object.fromEntries(Object.entries(cons).map(([name, val]) => [`$${ name }`, val]));
                    name = name.slice(1);
                }
                if (name === 'references') name = 'foreignKey';
                if (name in normalized) Object.assign(normalized[name], cons);
                else normalized[name] = cons;
                return normalized;
            }, {});
            // Constraints
            for (const name in constraintsNormalized) {
                instance.constraint(_fromCamel(name, '_').toUpperCase(), constraintsNormalized[name]);
            }
            return instance;
		});
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        let constraints = this.CONSTRAINTS;
        if (this.params.dialect === 'mysql') { constraints = constraints.filter(c => c.TYPE !== 'FOREIGN_KEY'); }
        return `${ this.autoEsc(this.name()) } ${ this.type() }${ constraints.length ? ` ${ constraints.join(' ') }` : '' }`;
    }
    
    /**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ namePart, bodyPart ] = Lexer.split(expr, ['\\s+'], { useRegex: true, limit: 1 });
        const [name] = this.parseIdent(context, namePart.trim(), true) || [];
        if (!name) return;
        const instance = (new this(context)).name(name);
        // Parse into "type" and constraints
        const qualifier = '(CONSTRAINT\\s+.+?\\s+)?';
        const regexes = [
            { test: `${ qualifier }(PRIMARY[ ]+KEY|NOT[ ]+NULL|GENERATED|REFERENCES|UNIQUE(?:[ ]+KEY)?|CHECK|AUTO_INCREMENT)` },
            { backtest: '^(?!.*\\s+(NOT|SET)\\s+$)', test: `${ qualifier }NULL` },
            { backtest: '^(?!.*\\s+BY\\s+$)', test: `${ qualifier }DEFAULT` },
            { backtest: '^(?!.*\\s+REFERENCES\\s+)', test: `ON\\s+UPDATE` },
        ];
        const [ columnType, ...tokens ] = Lexer.split(bodyPart, regexes, { useRegex:'i', preserveDelims: true });
        // Type
        instance.type(parseCallback(instance, columnType.trim(), [DataType]));
        // Constraints
        for (const constraint of tokens) {
            const cons = parseCallback(instance, constraint, this.CONSTRAINT_TYPES);
            instance.build('CONSTRAINTS', [cons], this.CONSTRAINT_TYPES);
        }
        return instance;
    }
}