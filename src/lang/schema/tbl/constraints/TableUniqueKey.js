
import AbstractTableConstraint from './AbstractTableConstraint.js';
import UniqueKey from "./UniqueKey.js";

export default class TableUniqueKey extends AbstractTableConstraint(UniqueKey) {}