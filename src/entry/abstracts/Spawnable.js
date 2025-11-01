import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProxyDriver } from './driver/ProxyDriver.js';

export const Spawnable = (Base) => class extends Base {
    static spawn(params) {
        const __file__ = fileURLToPath(import.meta.url);
        const worker = fork(__file__, ['--linked-ql-client-autorun'], params);
        return worker;
    }
}

if (process.send && process.argv.includes('--linked-ql-client-autorun')) {
    const DB_PARAMS = process.env.DB_PARAMS;

    const driver = new ProxyDriver(DB_PARAMS);
    const instance = new Client(driver);

    process.on('message', () => {

    });
}