import { EdgeClient } from './clients/edge/EdgeClient.js';
import { FlashQL } from './flashql/FlashQL.js';

// As globals
if (!window.webqit) { window.webqit = {}; }
window.webqit.EdgeClient = EdgeClient;
window.webqit.FlashQL = FlashQL;
