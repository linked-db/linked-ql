
import Node from '../abstracts/Node.js';
import CreateTable from '../create/CreateTable.js';
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
	rename(newName) {
        this.TYPE = 'RENAME';
        this.ARGUMENT = newName;
		return this;
	}

	/**
	 * Adds a "MOVE" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns this
	 */
	move(newDb) {
        this.TYPE = 'MOVE';
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
	new(argument) {
        this.TYPE = 'NEW';
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
	 * @param Any argument
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
	 * Adds a "CHANGE" action to the instance,
	 * 
	 * @param Object argument
	 * @param Column argument
	 * 
	 * @returns this
	 */
	change(reference, argument) {
        this.TYPE = 'CHANGE';
        this.REFERENCE = reference;
        this.ARGUMENT = argument;
		return this;
	}

	/**
	 * Adds a "OWNER" action to the instance,
	 * 
	 * @param Column argument
	 * 
	 * @returns this
	 */
	owner(argument) {
        this.TYPE = 'OWNER';
        this.ARGUMENT = argument;
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
			...(this.FLAGS.length ? { flags: this.FLAGS } : {}),
        }
    }

    /**
     * @inheritdoc
     */
    static fromJson(context, json) {
        if (typeof json?.type !== 'string' || !json.argument) return;
        const instance = (new this(context)).withFlag(...(json.flags || []));
        // RENAME/MOVE
        if (['RENAME','MOVE'].includes(json.type)) {
            instance[json.type === 'RENAME' ? 'rename' : 'move'](json.argument);
            return instance;
        }
        // DROP/ADD
        if (['DROP','NEW','SET'].includes(json.type)) {
            let Classes = [];
            if (['NEW','SET'].includes(json.type)) Classes = [...Column.CONSTRAINT_TYPES,DataType];
            if (json.type === 'NEW') Classes = [...CreateTable.CONSTRAINT_TYPES.concat(Classes),Index,Column];
            const argument = Classes.reduce((prev, Class) => prev || Class.fromJson(context, json.argument), null) || json.argument;
            instance[json.type.toLowerCase()](argument);
            return instance;
        }
        // ALTER
        if (json.type === 'ALTER') {
            // Handle columns specially
            const { reference, argument: subAction } = json;
            instance.alter(reference, this.fromJson(instance, subAction));
            return instance;;
        }
		// ALTER
        if (json.type === 'CHANGE') {
            // Handle columns specially
            const { reference, argument } = json;
            instance.change(reference, Column.fromJson(instance, argument));
            return instance;;
        }
    }
}