import PrimaryKey from "./PrimaryKey.js";
import AbstractTableConstraint from './AbstractTableConstraint.js';

export default class TablePrimaryKey extends AbstractTableConstraint(PrimaryKey) {}