import { JSONSchema } from '../../lang/abstracts/JSONSchema.js';

export class FlashRequest extends Request {
    resultSchema() {
        return new JSONSchema
    }
}