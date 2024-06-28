
import Lexer from '../Lexer.js';
import { _after, _before, _unwrap, _toCamel } from '@webqit/util/str/index.js';
import ColumnLevelConstraint from './ColumnLevelConstraint.js';
import DataType from './DataType.js';		
import Node from '../abstracts/Node.js';

export default class Column extends Node {

    /**
	 * Instance properties
	 */
	NAME = '';
	TYPE = null;
	CONSTRAINTS = [];

    /**
	 * @constructor
	 */
    constructor(context, name) {
        super(context);
        this.NAME = name;
    }

	/**
	 * Sets the column type,
	 * 
	 * @param DataType|Object value
	 * 
	 * @returns this
	 */
	type(value) { return this.build('TYPE', [value], DataType); }

	/**
	 * Adds a column-level constraint to the column,
	 * 
	 * @param ColumnLevelConstraint constraint
	 * 
	 * @returns this
	 */
	constraint(...constraints) { return this.build('CONSTRAINTS', constraints, ColumnLevelConstraint); }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
        let json = {
            name: this.NAME,
            type: this.TYPE?.toJson(),
        };
        for (const constraint of this.CONSTRAINTS) {
            const { constraintName, type, detail } = constraint.toJson();
            const equivProperty = Object.keys(ColumnLevelConstraint.attrEquivalents).find(prop => ColumnLevelConstraint.attrEquivalents[prop] === type);
            json = { ...json, [ equivProperty ]: { constraintName, ...detail } };
        }
        return json;
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string') return;
        const instance = new this(context, json.name);
        // Constraints
        for (const property in ColumnLevelConstraint.attrEquivalents) {
            if (!json[property]) continue;
            const { constraintName, ...detail } = json[property];
            const type = ColumnLevelConstraint.attrEquivalents[property];
            instance.constraint(ColumnLevelConstraint.fromJson(instance, { constraintName, type, detail }));
        }
        // An instance with just the name is used in AlterTable.fromJson() for DROP col_name
        if (json.type) instance.type(DataType.fromJson(instance, json.type));
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        // Render constraints in the order of ColumnLevelConstraint.attrEquivalents;
        let constraints = Object.values(ColumnLevelConstraint.attrEquivalents).map(type => this.CONSTRAINTS.find(cnst => cnst.TYPE === type)).filter(c => c);
        if (this.params.dialect === 'mysql') { constraints = constraints.filter(c => c.TYPE !== 'FOREIGN_KEY'); }
        return `${ this.autoEsc(this.NAME) } ${ this.TYPE }${ constraints.length ? ` ${ constraints.join(' ') }` : '' }`;
    }
    
    /**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ namePart, bodyPart ] = Lexer.split(expr, ['\\s+'], { useRegex: true, limit: 1 });
        const [name] = this.parseIdent(context, namePart.trim(), true) || [];
        if (!name) return;
        const instance = new this(context, name);
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
            instance.constraint(parseCallback(instance, constraint, [ColumnLevelConstraint]));
        }
        return instance;
    }
}