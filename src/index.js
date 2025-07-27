import './lang/index.js';
import { Query } from './lang/Query.js';

//console.log('LinkedQL loaded', (await Query.parse('SELECT * FROM users; INSERT INTO u SELECT *;')) + '');
export { Query };
