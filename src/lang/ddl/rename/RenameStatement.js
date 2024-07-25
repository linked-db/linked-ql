
import Rename from './Rename.js';
import AbstractStatement from '../AbstractStatement.js';

export default class RenameStatement extends AbstractStatement(Rename) {

    static KINDS = ['TABLE','SCHEMA','DATABASE'];
}