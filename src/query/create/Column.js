
import Lexer from '../Lexer.js';
import { _toCamel, _fromCamel } from '@webqit/util/str/index.js';
import AbstractNode from './abstracts/AbstractNode.js';
import AutoIncrement from './constraints/AutoIncrement.js';
import Identity from './constraints/Identity.js';
import Expression from './constraints/Expression.js';
import Default from './constraints/Default.js';
import NotNull from './constraints/NotNull.js';
import PrimaryKey1 from './constraints/PrimaryKey1.js';
import ForeignKey1 from './constraints/ForeignKey1.js';
import UniqueKey1 from './constraints/UniqueKey1.js';
import Check from './constraints/Check.js';
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
    static CONSTRAINT_TYPES = [AutoIncrement,Identity,Expression,Default,NotNull,PrimaryKey1,ForeignKey1,UniqueKey1,Check];

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
    autoIncrement(trueFalse = null) { return this.constraint('AUTO_INCREMENT', ...arguments); }

    /**
     * IDENTITY
     */
    identity(trueFalse = null) { return this.constraint('IDENTITY', ...arguments); }

    /**
     * EXPRESSION
     */
    expression(trueFalse = null) { return this.constraint('EXPRESSION', ...arguments); }

    /**
     * DEFAULT
     */
    default(trueFalse = null) { return this.constraint('DEFAULT', ...arguments); }

    /**
     * NOT_NULL
     */
    notNull(trueFalse = null) { return this.constraint('NOT_NULL', ...arguments); }

    /**
     * PRIMARY_KEY
     */
    primaryKey(trueFalse = null) { return this.constraint('PRIMARY_KEY', ...arguments); }

    /**
     * FOREIGN_KEY
     */
    foreignKey(trueFalse = null) { return this.constraint('FOREIGN_KEY', ...arguments); }

    /**
     * UNIQUE_KEY
     */
    uniqueKey(trueFalse = null) { return this.constraint('UNIQUE_KEY', ...arguments); }

    /**
     * CHECK
     */
    check(trueFalse = null) { return this.constraint('CHECK', ...arguments); }

	/**
	 * Adds a column-level constraint to the column,
	 * 
	 * @param String type
	 * @param Bool setting
	 * 
	 * @returns this
	 */
	constraint(type, setting = null) {
        const existing = this.CONSTRAINTS.find(cons => cons.TYPE === type);
        if (arguments.length === 1) return existing;
        if (setting) {
            if (existing) {
                if (setting === true || !Object.keys(setting).length) return;
                throw new Error(`${ type } already exists in column. Granular modification of a constraint must be done on an instance of the contraint itself.`);
            }
            this.build('CONSTRAINTS', [{ type, ...(typeof setting === 'object' ? setting : (typeof setting === 'string' ? { expr: setting } : {}))  }], this.constructor.CONSTRAINT_TYPES);
            return this.constraint(type);
        }
        if (existing) existing.drop();
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