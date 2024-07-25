
import AbstractTableConstraint from './AbstractTableConstraint.js';
import ColumnUniqueKey from "./ColumnUniqueKey.js";

export default class TableUniqueKey extends AbstractTableConstraint(ColumnUniqueKey) {}