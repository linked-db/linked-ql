import AbstractStatement from '../AbstractStatement.js';
import Rename from './Rename.js';

export default class RenameStatement extends AbstractStatement(Rename) {
    static KINDS = ['TABLE','SCHEMA','DATABASE'];
}