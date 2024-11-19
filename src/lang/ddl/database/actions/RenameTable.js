import { AbstractDDLStatement } from '../../../AbstractDDLStatement.js';
import { Rename } from './Rename.js';

export class RenameTable extends AbstractDDLStatement(Rename) {}