
/**
 * @imports
 */
import ExprInterface from '../../ExprInterface.js';

/**
 * ---------------------------
 * AlterStatement
 * ---------------------------
 */				

const Interface = class extends ExprInterface {
	static isSame(a, b) {
		if (a === b) return true;
		if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
			const $b = b.slice(0).sort();
			return a.slice(0).sort().every((x, i) => this.isSame(x, $b[i]));
		}
		const temp = {};
		if (typeof a === 'object' && a && typeof b === 'object' && b && (temp.keys_a = Object.keys(a)).length === (temp.keys_b = Object.keys(b)).length) {
			return temp.keys_a.reduce((prev, k) => prev && this.isSame(a[k], b[k]), true);
		}
		return false;
	}
	static makeSets(a, b, nameKey) {
		if (Array.isArray(a)) {
			a = a.map(x => x[nameKey]);
			b = b.map(x => `$${ nameKey }` in x ? x[`$${ nameKey }`] : x[nameKey]);
		} else {
			a = Object.keys(a);
			b = Object.keys(b).filter(s => !s.startsWith('$'));
		}
		a = new Set(a);
		b = new Set(b);
		const ab = new Set([ ...a, ...b ]);
		return [ a, b, ab ];
	}
};
Object.defineProperty(Interface.prototype, 'jsenType', {
	get() { return 'AlterStatement'; },
});
export default Interface;
