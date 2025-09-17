import './lang/index.js';
import { Script } from './lang/Script.js';

//console.log('LinkedQL loaded', (await Script.parse('SELECT * FROM users; INSERT INTO u SELECT *;')) + '');
export { Script };
