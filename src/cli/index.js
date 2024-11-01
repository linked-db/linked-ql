#!/usr/bin/env node
import fs from 'node:fs';
import url from 'node:url';
import YAML from 'yaml';
import path from 'node:path';
import enquirer from 'enquirer';
import { parseArgv } from "./util.js";
import { _toTitle } from '@webqit/util/str/index.js';
import { RootSchema } from '../lang/ddl/RootSchema.js';
import { RootCDL } from '../lang/ddl/RootCDL.js';
import { Savepoint } from '../api/Savepoint.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);
if (flags['with-env']) await import('dotenv/config');
// Validate flags.direction
if (flags.direction && !['forward', 'backward'].includes(flags.direction)) throw new Error(`Invalid --direction. Expected: forward|backward`);
// Map depreciated commands to corresponding commands
if (flags.auto) flags.yes = true;
const deprCommands = {
    forget: 'clear-histories',
    leaderboard: 'state',
    migrate: 'commit',
}
const $command = deprCommands[command] || command;

const importClients = async (dir) => {
    let driverFile, imports;
    if (!fs.existsSync(driverFile = path.resolve(dir, 'driver.js')) || (
        (imports = await import(url.pathToFileURL(driverFile))) && typeof imports.default !== 'function'
    )) {
        throw new Error(`\nNo Linked QL client has been configured at ${driverFile}. Aborting.`);
    }
    return {
        default: await imports.default(),
        remote: await imports.remote?.(),
    };
};

const createFilesAPI = (dir) => {
    const fileResolution = (filename) => [['json', JSON], ['yml', YAML]].map(([ext, parser]) => [path.resolve(dir, `${filename}.${ext}`), parser]);
    const readFile = (filename) => fileResolution(filename).reduce((prev, [file, parser]) => {
        return prev || !fs.existsSync(file) ? undefined : parser.parse(fs.readFileSync(f).toString().trim() || 'null');
    }, null);
    const writeFile = (filename, json) => {
        const target = ((ee) => ee.find((e) => fs.writeFileSync(e.file)) || { ...ee[0], autoGenerate: true })(fileResolution(filename));
        fs.writeFileSync(target.file, target.parser.stringify(json, null, 3));
        console.log(`\nLocal ${target.file} file ${!target.autoGenerate ? 'updated' : 'generated'}.`);
    };
    return {
        schema: { read: () => readFile('schema'), write: (json) => writeFile('schema', json) },
        histories: { read: () => readFile('histories'), write: (json) => writeFile('histories', json) },
    };
};

const getResolvedSchemaSelector = (client) => {
    const schemaSelector = new Map(clientAPIS.default.params.schemaSelector.map((s) => [/^!/.test(s) ? s.slice(1) : s, s]));
    for (const s of flags.schemaSelector?.split(',').map((s) => s.trim())) {
        schemaSelector.set(/^!/.test(s) ? s.slice(1) : s, s);
    }
    return schemaSelector;
};

// ------
const dir = flags.dir || './database/';
const clientAPIS = await importClients(dir);
const fileAPIS = createFilesAPI(dir);

const notFoundExit = (thing = 'schemas') => {
    console.log(`No ${thing} found for ${flags.schemaSelector ? `the schema selector "${flags.schemaSelector.split(',').map((s) => s.trim()).join('", "')}"` : 'any databases'}. Aborting.`);
    process.exit();
};

const confirm = async (message) => {
    console.log([].concat(message).json('\n'));
    if (flags.yes) console.log(`(--yes, auto-proceeding...)`);
    return flags.yes || (await enquirer.prompt({
        type: 'confirm',
        name: 'q',
        message: 'Proceed?'
    })).q;
};

const prompt = async (message) => {
    return (await enquirer.prompt({
        type: 'text',
        name: 'q',
        message
    })).q;
};

// ------

if ($command === 'state') {
    const savepoints = await clientAPIS.default.getSavepoints({ selector: flags.schemaSelector?.split(',').map((s) => s.trim()) });
    console.table(savepoints.map(sv => sv.jsonfy()), ['name', 'database_tag', 'version_tag', 'version_tags', 'commit_date', 'commit_desc', 'rollback_date', 'rollback_desc']);
    process.exit(); // Done!
}

if (['generate', 'refresh'].includes($command)) {
    const localSchema = RootSchema.fromJSON(clientAPIS.default, fileAPIS.schema.read());
    let upstreamSchema, savepointsLite;
    if ($command === 'refresh') {
        savepointsLite = await clientAPIS.default.getSavepoints({ lite: true, selector: flags.schemaSelector?.split(',').map((s) => s.trim()) });
        upstreamSchema = await clientAPIS.default.schema({ depth: 2, selector: savepointsLite.map((s) => s.name) });
    } else {
        const schemaSelector = getResolvedSchemaSelector();
        savepointsLite = await clientAPIS.default.getSavepoints({ lite: true });
        for (const v of savepointsLite) schemaSelector.set(v.name, `!${v.name}`);
        upstreamSchema = await clientAPIS.default.schema({ depth: 2, selector: [...schemaSelector.values()] });
    }
    if (upstreamSchema.length) {
        for (const dbSchema of upstreamSchema) {
            localSchema.database({ ...dbSchema.jsonfy(), version: savepointsLite.find((v) => dbSchema.identifiesAs(v.name)).version_tag || 0 });
        }
        const schemaJson = localSchema.jsonfy({ nodeNames: false });
        console.log(`\nDone.`);
        fileAPIS.schema.write(schemaJson);
    } else if (!($command === 'refresh' && flags.live)) notFoundExit();
    // Enter live mode?
    if ($command === 'refresh' && flags.live) {
        console.log(`Live refresh active...`);
        clientAPIS.default.listen('savepoints', (e) => {
            const payload = JSON.parse(e.payload);
            if (payload.action === 'DELETE') return;
            // ------
            const version_state = payload.body.version_state;
            const version_state_title = _toTitle(version_state);
            const dbNameBeforeChange = version_state === 'rollback' && payload.body.$name || payload.body.name;
            const { version_tag, [`${version_state}_desc`]: desc, [`${version_state}_ref`]: ref, [`${version_state}_pid`]: pid } = payload.body;
            console.log(`New ${version_state} event on database "${dbNameBeforeChange}" ${version_state === 'rollback' ? 'from' : 'to'} version ${version_tag}. ${version_state_title} desc: "${desc}". ${version_state_title} ref: "${ref}". ${version_state_title} PID: "${pid}".`);
            // ------
            const savepoint = new Savepoint(clientAPIS.default, payload.body);
            const rootCDL = RootCDL.fromJSON(clientAPIS.default, { actions: [savepoint.querify()] });
            const rootSchema = RootSchema.fromJSON(clientAPIS.default, fileAPIS.schema.read());
            const schemaJson = rootSchema.alterWith(rootCDL, { diff: false }).jsonfy({ nodeNames: false });
            fileAPIS.schema.write(schemaJson);
        });
    } else process.exit(); // Done!
}

if ($command === 'commit') {
    if (!flags.desc && flags.yes) throw new Error(`Command missing the --desc parameter.`);
    // Schema selector
    let localSchema, upstreamSchema;
    const savepointsLite = await clientAPIS.default.getSavepoints({ lite: true });
    if (flags.schemaSelector) {
        const schemaSelector = getResolvedSchemaSelector();
        const [a, b] = [...schemaSelector.values()].reduce(([a, b], s) => {
            let negation;
            if (/^!/.test(s)) {
                negation = true;
                s = s.slice(1);
            }
            const re = new RegExp(`^${s.replace(/%/g, '(.+)')}$`, 'i');
            if (negation) return [a, b.concat(re)];
            return [a.concat(re), b];
        }, [[], []]);
        upstreamSchema = await clientAPIS.default.schema({ depth: 2, selector: [...schemaSelector.values()] });
        const matchName = (name) => (!b.length || b.every((re) => !re.test(name))) && (!a.length || a.some((re) => re.test(name)));
        localSchema = RootSchema.fromJSON(clientAPIS.default, (fileAPIS.schema.read() || []).filter((sc) => matchName(sc.name)));
    } else {
        upstreamSchema = await clientAPIS.default.schema({ depth: 2, selector: savepointsLite.map((sc) => sc.name) });
        localSchema = RootSchema.fromJSON(clientAPIS.default, (fileAPIS.schema.read() || []));
    }
    // Schema diffing
    const $resultSchema = upstreamSchema.diffWith(localSchema);
    for (const dbAction of $resultSchema.generateCDL()) {
        // Preview...
        const confirmMessage = [];
        const prettyName = dbAction.CLAUSE === 'CREATE' 
            ? `${dbAction.argument().name()}@1`
            : `${dbAction.reference().name()}@${savepointsLite.find((v) => dbAction.reference().identifiesAs(v.name)).version_tag}`;
        if (dbAction.CLAUSE === 'DROP') {
            confirmMessage.push(`Dropping database ${prettyName}!`);
            if (clientAPIS.default.params.dialect !== 'mysql') dbAction.withFlag('CASCADE');
        } else if (dbAction.CLAUSE === 'CREATE') {
            confirmMessage.push(`Creating database ${prettyName}!`);
        } else if (dbAction.CLAUSE === 'ALTER') {
            confirmMessage.push(`Altering database ${prettyName}!`);
        }
        if (!flags.quiet) confirmMessage.push(`SQL preview:\n${dbAction}\n`);
        // Confirm and execute...
        if (await confirm(confirmMessage)) {
            const commitDetails = {
                ref: flags.ref || clientAPIS.default.params.commitRef,
                desc: flags.desc || await prompt('Enter commit description:'),
            };
            await clientAPIS.default.query(dbAction, commitDetails);
        }
    }
    process.exit(); // Done!
}

if ($command === 'rollback') {
    const savepoints = await clientAPIS.default.getSavepoints({ selector: flags.schemaSelector?.split(',').map((s) => s.trim()), direction: flags.direction });
    if (!savepoints.length) notFoundExit('savepoint records');
    const rootCDL = RootCDL.fromJSON(clientAPIS.default, { actions: [] });
    for (const savepoint of savepoints) {
        // Preview...
        const confirmMessage = [];
        confirmMessage.push(`Rolling ${flags.direction === 'forward' ? 'forward' : 'back'} database ${savepoint.name()} to version ${savepoint.direction === 'forward' ? savepoint.versionTag() : savepoint.versionDown()}.`);
        confirmMessage.push(`This will mean ${savepoint.rollbackEffect() === 'DROP' ? 'dropping' : (savepoint.rollbackEffect() === 'RECREATE' ? 'recreating' : 'altering')} the database!`);
        const rollbackQuery = savepoint.rollbackQuery();
        if (!flags.quiet) confirmMessage.push(`SQL preview:\n${rollbackQuery}\n`);
        // Confirm and execute...
        if (await confirm(confirmMessage)) {
            const commitDetails = {
                desc: flags.desc || await prompt('Enter rollback description:'),
                ref: flags.ref || clientAPIS.default.params.commitRef,
            };
            await savepoint.rollback(commitDetails);
            rootCDL.add(rollbackQuery);
        }
    }
    // Generate result schema
    if (rootCDL.length) {
        const localSchema = RootSchema.fromJSON(clientAPIS.default, fileAPIS.schema.read());
        const resultJson = localSchema.alterWith(rootCDL, { diff: false }).jsonfy({ nodeNames: false }).map(({ name, ...json }) => {
            return { name, version: savepoints.find((sv) => sv.$eq(sv.name(true), name))[flags.direction === 'forward' ? 'versionTag' : 'versionDown'](), ...json };
        });
        console.log(`\nDone.`);
        fileAPIS.schema.write(resultJson);
    }
    process.exit(); // Done!
}

if ($command === 'clear-histories') {
    const utils = clientAPIS.default.createCommonSQLUtils();
    const savepointsLite = await clientAPIS.default.getSavepoints({ lite: true, selector: flags.schemaSelector?.split(',').map((s) => s.trim()) });
    if (!savepointsLite.length) notFoundExit('savepoint records');
    // Confirm and execute...
    const confirmMessage = [`This will permanently erase savepoint records for ${savepointsLite.map((v) => `${utils.ident(v.name)}@${v.version_tag}`).join(', ')}!`];
    if (await confirm(confirmMessage)) {
        const linkedDB = await clientAPIS.default.linkedDB();
        await clientAPIS.default.query(`DELETE FROM ${linkedDB.table('savepoints').ident} WHERE ${utils.matchSelector('database_tag', savepointsLite.map((v) => v.database_tag))}`);
        console.log(`\nDone.`);
    }
    process.exit(); // Done!
}
