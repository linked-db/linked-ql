
import AbstractNode1 from '../AbstractNode.js';

export default class AbstractNode extends AbstractNode1 {

	/**
	 * Instance props.
	 */
	get CLAUSE() { return this.constructor.CLAUSE; }
	KIND;

    /**
     * @constructor
     */
    constructor(context, kind) {
        super(context);
        this.KIND = kind;
    }

	toJSON() {
        return {
			clause: this.CLAUSE,
            ...(this.KIND ? { kind: this.KIND } : {}),
			...super.toJSON(),
        };
    }

	static fromJSON(context, json) {
		if (json?.clause && json.clause !== this.CLAUSE || (json?.kind && !this.KINDS.includes(json.kind))) return;
		return (new this(context, json.kind)).withFlag(...(json.flags || []));
	}

    static KINDS = [];
}