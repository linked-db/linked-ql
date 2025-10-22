import { JSONSchema } from '../../../lang/abstracts/JSONSchema.js';

export class LQRequest extends Request {
    resultSchema() {
        return new JSONSchema
    }
}