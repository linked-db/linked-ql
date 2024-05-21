
import Node from '../abstracts/Node.js';
import TableLevelConstraint from '../create/TableLevelConstraint.js';
import ColumnLevelConstraint from '../create/ColumnLevelConstraint.js';
import DataType from '../create/DataType.js';
import Column from '../create/Column.js';
import Index from '../create/Index.js';

export default class Action extends Node {

    /**
     * Instance properties
     */
    TYPE = '';
    REFERENCE = null;
    ARGUMENT = null;

	/**
	 * Adds a "RENAME" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns this
	 */
	renameTo(newName) {
        this.TYPE = 'RENAME';
        this.ARGUMENT = newName;
		return this;
	}

	/**
	 * Adds a "RELOCATE" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns this
	 */
	relocateTo(newDb) {
        this.TYPE = 'RELOCATE';
        this.ARGUMENT = newDb;
		return this;
	}

	/**
	 * Adds a "DROP" action to the instance,
	 * 
	 * @param Object argument
	 * 
	 * @returns this
	 */
	drop(argument) {
        this.TYPE = 'DROP';
        this.ARGUMENT = argument;
		return this;
	}

	/**
	 * Adds a "ADD" action to the instance,
	 * 
	 * @param Object argument
	 * 
	 * @returns this
	 */
	add(argument) {
        this.TYPE = 'ADD';
        this.ARGUMENT = argument;
		return this;
	}

	/**
	 * Adds a "SET" action to the instance,
	 * 
	 * @param Object reference
	 * 
	 * @returns this
	 */
	set(argumentNew) {
        this.TYPE = 'SET';
        this.ARGUMENT = argumentNew;
		return this;
	}

	/**
	 * Adds a "ALTER" action to the instance,
	 * 
	 * @param Object reference
	 * 
	 * @returns this
	 */
	alter(reference, argument) {
        this.TYPE = 'ALTER';
        this.REFERENCE = reference;
        this.build('ARGUMENT', [argument], Action);
		return this;
	}

    /**
     * @inheritdoc
     */
    toJson() {
        return {
            type: this.TYPE,
            ...(this.REFERENCE ? { reference: this.REFERENCE } : {}),
            argument: typeof this.ARGUMENT?.toJson === 'function' ? this.ARGUMENT.toJson() : this.ARGUMENT,
            flags: this.FLAGS,
        }
    }

    /**
     * @inheritdoc
     */
    static fromJson(context, json) {
        if (typeof json?.type !== 'string' || !json.argument) return;
        const instance = (new this(context)).withFlag(...(json.flags || []));
        // RENAME/RELOCATE
        if (['RENAME','RELOCATE'].includes(json.type)) {
            instance[json.type === 'RENAME' ? 'renameTo' : 'relocateTo'](json.argument);
            return instance;
        }
        // DROP/ADD
        if (['DROP','ADD','SET'].includes(json.type)) {
            const argument = [TableLevelConstraint,Index,Column].reduce((prev, Class) => prev || Class.fromJson(context, json.argument), null);
            instance[json.type === 'DROP' ? 'drop' : (json.type === 'SET' ? 'set' : 'add')](argument);
            return instance;
        }
        // ALTER
        if (json.type === 'ALTER') {
            // Handle columns specially
            const { reference, argument: subAction } = json;
            let arg = subAction.argument;
            if (reference.kind === 'COLUMN') {
                arg = [ColumnLevelConstraint,DataType].reduce((prev, Class) => prev || Class.fromJson(context, arg), null) || arg;
            } else {
                const Class = reference.kind === 'CONSTRAINT' ? TableLevelConstraint : Index;
                arg = Class.fromJson(context, arg) || arg;
            }
            const methodName = subAction.type.toLowerCase() + (['RENAME', 'RELOCATE'].includes(subAction.type) ? 'To' : '');
            instance.alter(reference, a => a[methodName](arg));
            return instance;;
        }
    }
}