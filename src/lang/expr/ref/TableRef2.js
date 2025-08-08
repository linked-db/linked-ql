import { TableRef1 } from './TableRef1.js';

export class TableRef2 extends TableRef1 {

    canReferenceInlineTables() { return false; }
}