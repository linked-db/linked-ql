
import { _after, _before, _unwrap, _toCamel } from '@webqit/util/str/index.js';
import ColumnLevelConstraint from './ColumnLevelConstraint.js';
import ColumnInterface from './ColumnInterface.js';
import DataType from './DataType.js';

/**
 * ---------------------------
 * Column class
 * ---------------------------
 */				

export default class Column extends ColumnInterface {

    /**
	 * @constructor
	 */
    constructor(name, type, constraints, params = {}) {
        super();
        this.name = name;
        this.type = type;
        this.constraints = constraints;
        this.params = params;
    }

	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
        // Render constraints in the order of ColumnLevelConstraint.attrEquivalents;
        let constraints = Object.values(ColumnLevelConstraint.attrEquivalents).map(attr => this.constraints.find(cnst => cnst.attribute === attr)).filter(c => c);
        if (this.params.dialect === 'mysql') {
            constraints = constraints.filter(c => c.attribute !== 'REFERENCES');
        }
        return `${ this.name } ${ this.type }${ constraints.length ? ` ${ constraints.join(' ') }` : '' }`;
    }
	
	/**
	 * @inheritdoc
	 */
	toJson() {
        let json = {
            name: this.name,
            type: this.type?.toJson(),
        };
        for (const constraint of this.constraints) {
            const { constraintName, attribute, detail } = constraint.toJson();
            const equivProperty = Object.keys(ColumnLevelConstraint.attrEquivalents).find(prop => ColumnLevelConstraint.attrEquivalents[prop] === attribute);
            json = { ...json, [ equivProperty ]: { constraintName, ...detail } };
        }
        return json;
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.name || !json.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain column name or column name invalid.`);
        // Constraints
        const constraints = [];
        for (const property in ColumnLevelConstraint.attrEquivalents) {
            if (!json[property]) continue;
            const { constraintName, ...detail } = json[property];
            const attrName = ColumnLevelConstraint.attrEquivalents[property];
            constraints.push(ColumnLevelConstraint.fromJson({ constraintName, attribute: attrName, detail }, params));
        }
        // Instance
		return new this(json.name, DataType.fromJson(json.type, params), constraints, params);
	}
    
    /**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
        let [ name ] = expr.match(/^\w+/);
        let $expr = expr, constraint, constraints = [];
        while($expr && (constraint = await parseCallback($expr, [ColumnLevelConstraint], {...params, assert: false}))) {
            constraints.push(constraint);
            $expr = $expr.replace(constraint.params.wholeMatch, '');
        }
        return new this(name, await DataType.parse($expr/* NOTE: not expr but $expr */, parseCallback, params), constraints, params);
    }
}