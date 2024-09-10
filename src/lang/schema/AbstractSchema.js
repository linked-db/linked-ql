import AbstractNode from './AbstractNode.js';
import Identifier from '../components/Identifier.js';

export default class AbstractSchema extends AbstractNode {

	/**
	 * Instance properties
	 */
	NAME;
	$NAME;
	KEEP;

	/**
	 * @inheritdoc
	 */
	$trace(request, ...args) {
		if (request === 'get:node:schema') return this;
        return super.$trace(request, ...args);
	}
    
	/**
	 * NAME
	 */
	name(name) {
		if (!arguments.length) return this[this.smartKey('NAME')];
        return (this.build(this.smartKey('NAME', true), [name], Identifier, 'name'), this);
    }

    /**
	 * @inheritdoc
	 */
    diffWith(nodeB) {
		if (typeof nodeB.keep() === 'boolean') this.keep(nodeB.keep());
        if (!this.isSame(nodeB.name().toJSON(), this.name().toJSON())) { this.name(nodeB.name().toJSON()); }
    }

	/**
	 * @inheritdoc
	 */
	toJSON(json = {}) {
		return {
			name: this.NAME.toJSON(),
			...(this.$NAME ? { $name: this.$NAME.toJSON() } : {}),
			...json,
			...(typeof this.KEEP === 'boolean' ? { keep: this.KEEP } : {}),
			...(this.FLAGS.length ? { flags: [ ...this.FLAGS ] } : {}),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json, callback = null) {
		if (!json?.name || !Identifier.fromJSON({}, json.name)) return;
		const instance = callback ? callback() : new this(context);
        instance.hardSet(() => instance.name(json.name));
		instance.hardSet(json.$name, val => instance.name(val));
        if (typeof json.keep === 'boolean') instance.keep(json.keep);
        if (json.flags) instance.withFlag(...json.flags);
        return instance;
	}
}