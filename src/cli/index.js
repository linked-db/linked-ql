#!/usr/bin/env node
import fs from 'node:fs';
import url from 'node:url';
import YAML from 'yaml';
import path from 'node:path';
import enquirer from 'enquirer';
import { parseArgv, $eq } from "./util.js";
import { _toTitle } from '@webqit/util/str/index.js';
import { RootSchema } from '../lang/ddl/RootSchema.js';
import { RootCDL } from '../lang/ddl/RootCDL.js';
import { Savepoint } from '../api/Savepoint.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);
if (flags['with-env']) await import('dotenv/config');
// Map depreciated commands to corresponding commands
if (flags['auto']) flags['yes'] = true;
const deprCommands = {
    forget: 'clear-histories',
    leaderboard: 'savepoints',
    state: 'savepoints',
    migrate: 'commit',
}

// ------

const dir = flags['dir'] || './database/';
const $command = deprCommands[command] || command;
const fileAPIS = createFilesAPI(dir);
const clientAPIS = await importClients(dir);
switch($command) {
    // Histories
    case 'savepoints': await showSavepoints();
    case 'dump-histories': await dumpHistories();
    case 'clear-histories': await clearHistories();
    // Local
    case 'refresh': await refresh();
    case 'generate': await generate();
    // Commit / restore
    case 'commit': await commit();
    case 'rollback': await restore();
    case 'rollforward': await restore(true);
    case 'restore': await restore(!!flags['forward']);
    // Replication
    case 'replicate': await replicate();
}

// ------

function createFilesAPI(dir) {
    const fileResolution = (filename) => [['json', JSON], ['yml', YAML]].map(([ext, parser]) => [path.resolve(dir, `${filename}.${ext}`), parser]);
    const readFile = (filename) => fileResolution(filename).reduce((prev, [file, parser]) => {
        return prev || (!fs.existsSync(file) ? undefined : parser.parse(fs.readFileSync(file).toString().trim() || 'null'));
    }, undefined);
    const writeFile = (filename, json) => {
        const target = ((ee) => ee.find((e) => fs.existsSync(e[0])) || [...ee[0], true])(fileResolution(filename));
        fs.writeFileSync(target[0], target[1].stringify(json, null, 3));
        console.log(`\nLocal ${path.basename(target[0])} file ${!target[2] ? 'updated' : 'generated'}.`);
    };
    return {
        schema: () => ({ read: () => readFile('schema'), write: (json) => writeFile('schema', json) }),
        histories: () => ({ read: () => readFile('histories'), write: (json) => writeFile('histories', json) }),
    };
}

async function importClients(dir) {
    let driverFile, imports = {};
    if (fs.existsSync(driverFile = path.resolve(dir, 'driver.js'))) {
        imports = await import(url.pathToFileURL(driverFile));
    }
    const client1 = await imports.default?.();
    const client2 = await imports.remote?.();
    return {
        default: (require = true) => {
            if (client1 && require) {
                throw new Error(`\nNo Linked QL client has been configured at ${driverFile}. Aborting.`);
            }
            return client1;
        },
        remote: (require = true) => {
            if (client2 && require) {
                throw new Error(`\nNo remote Linked QL client has been configured at ${driverFile}. Aborting.`);
            }
            return client2;
        },
    };
}

function notFoundExit(thing = 'schemas') {
    console.log(`No ${thing} found for ${flags['select'] ? `the selection "${flags['select'].split(',').map((s) => s.trim()).join('", "')}"` : 'any databases'}. Aborting.`);
    process.exit();
}

function getResolvedSchemaSelector() {
    const schemaSelector = new Map(clientAPIS.default().params.schemaSelector.map((s) => [/^!/.test(s) ? s.slice(1) : s, s]));
    for (const s of (flags['select']?.split(',') || []).map((s) => s.trim())) {
        schemaSelector.set(/^!/.test(s) ? s.slice(1) : s, s);
    }
    return schemaSelector;
}

async function confirm(message) {
    console.log([].concat(message).join('\n'));
    if (flags['yes']) console.log(`(--yes, auto-proceeding...)`);
    return flags['yes'] || (await enquirer.prompt({
        type: 'confirm',
        name: 'q',
        message: 'Proceed?'
    })).q;
}

async function prompt(message) {
    return (await enquirer.prompt({
        type: 'text',
        name: 'q',
        message
    })).q;
}

// ------

async function showSavepoints() {
    const savepoints = await clientAPIS.default().getSavepoints({ selector: flags['select']?.split(',').map((s) => s.trim()), lookAhead: !!flags['forward'] });
    const versionState = flags['forward'] ? 'rollback' : 'commit';
    console.table(savepoints.map(sv => sv.jsonfy()), ['name', 'version_tag', 'version_tags', 'version_state', `${versionState}_date`, `${versionState}_desc`]);
    process.exit();
}

async function dumpHistories() {
    const historiesJson = await clientAPIS.default().getSavepoints({ histories: true });
    console.log(`\nDone.`);
    fileAPIS.histories().write(historiesJson);
    process.exit();
}

async function clearHistories() {
    if (!flags['select']) {
        console.log(`No databases selected. Aborting.`);
        process.exit();
    }
    const utils = clientAPIS.default().createCommonSQLUtils();
    const savepointsLite = await clientAPIS.default().getSavepoints({ lite: true, selector: flags['select'].split(',').map((s) => s.trim()) });
    if (!savepointsLite.length) notFoundExit('savepoint records');
    // Confirm and execute...
    const confirmMessage = [`This will permanently erase savepoint records for ${savepointsLite.map((v) => `${utils.ident(v.name)}@${v.version_tag}`).join(', ')}!`];
    if (await confirm(confirmMessage)) {
        const linkedDB = await clientAPIS.default().linkedDB();
        await clientAPIS.default().query(`DELETE FROM ${linkedDB.table('savepoints').ident} WHERE ${utils.matchSelector('database_tag', savepointsLite.map((v) => v.database_tag))}`);
    }
    console.log(`\nDone.`);
    process.exit();
}

async function commit() {
    if (!flags['desc'] && flags['yes']) throw new Error(`Command missing the --desc parameter.`);
    // Schema selector
    let localSchema, upstreamSchema;
    const savepointsLite = await clientAPIS.default().getSavepoints({ lite: true });
    if (flags['select']) {
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
        const matchName = (name) => (!b.length || b.every((re) => !re.test(name))) && (!a.length || a.some((re) => re.test(name)));
        localSchema = RootSchema.fromJSON(clientAPIS.default(), (fileAPIS.schema().read() || []).filter((sc) => matchName(sc.name)));
        upstreamSchema = await clientAPIS.default().schema({ depth: 2, selector: [...schemaSelector.values()] });
    } else {
        localSchema = RootSchema.fromJSON(clientAPIS.default(), fileAPIS.schema().read() || []);
        upstreamSchema = await clientAPIS.default().schema({ depth: 2, selector: [...new Set(localSchema.databases(false).concat(savepointsLite.map((sc) => sc.name)))] });
    }
    // Schema diffing
    let commitsCount = 0;
    const CDL = upstreamSchema.diffWith(localSchema).generateCDL({ cascadeRule: flags['cascade-rule'] });
    for (const dbAction of CDL) {
        // Preview...
        const confirmMessage = [`\n----------\n`];
        const prettyName = dbAction.CLAUSE === 'CREATE'
            ? `${dbAction.argument().name()}@1`
            : `${dbAction.reference().name()}@${savepointsLite.find((v) => dbAction.reference().identifiesAs(v.name))?.version_tag || 0}`;
        if (dbAction.CLAUSE === 'DROP') {
            confirmMessage.push(`Dropping database ${prettyName}!`);
        } else if (dbAction.CLAUSE === 'CREATE') {
            confirmMessage.push(`Creating database ${prettyName}!`);
        } else if (dbAction.CLAUSE === 'ALTER') {
            confirmMessage.push(`Altering database ${prettyName}!`);
        }
        if (!flags['quiet']) confirmMessage.push(`SQL preview:\n${dbAction}\n`);
        // Confirm and execute...
        if (await confirm(confirmMessage)) {
            const commitDetails = {
                ref: flags['ref'] || clientAPIS.default().params.commitRef,
                desc: flags['desc'] || await prompt('Enter commit description:'),
            };
            await clientAPIS.default().query(dbAction, commitDetails);
            commitsCount ++;
        }
    }
    if (!commitsCount) {
        if (CDL.length) console.log('\nDone.');
        else console.log(`\nNo changes have been made.`);
        process.exit();
    } else await refresh();
}

async function restore(forward = false) {
    if (!flags['desc'] && flags['yes']) throw new Error(`Command missing the --desc parameter.`);
    const savepoints = await clientAPIS.default().getSavepoints({ selector: flags['select']?.split(',').map((s) => s.trim()), lookAhead: !!forward });
    if (!savepoints.length) notFoundExit(forward ? 'forward savepoint records' : 'savepoint records');
    let restoreCount = 0;
    for (const savepoint of savepoints) {
        // Preview...
        const confirmMessage = [`\n----------\n`];
        if (forward) {
            confirmMessage.push(`Rolling forward database ${savepoint.name()}@${savepoint.versionDown()} to version ${savepoint.versionTag()}.`);
        } else confirmMessage.push(`Rolling back database ${savepoint.name()}@${savepoint.versionTag()} to version ${savepoint.versionDown()}.`);
        confirmMessage.push(`This will mean ${savepoint.restoreEffect() === 'DROP' ? 'dropping' : (savepoint.restoreEffect() === 'RECREATE' ? 'recreating' : 'altering')} the database!`);
        const reverseSQL = savepoint.reverseSQL();
        if (!flags['quiet']) confirmMessage.push(`SQL preview:\n${reverseSQL}\n`);
        // Confirm and execute...
        if (await confirm(confirmMessage)) {
            const restoreDetails = {
                desc: flags['desc'] || await prompt(`Enter ${forward ? 'recommit' : 'rollback'} description:`),
                ref: flags['ref'] || clientAPIS.default().params.commitRef,
            };
            await savepoint.restore(restoreDetails);
            restoreCount ++;
        }
    }
    if (!restoreCount) {
        console.log('\nDone.');
        process.exit();
    } else await refresh();
}

async function refresh() {
    const localSchema = RootSchema.fromJSON(clientAPIS.default(), fileAPIS.schema().read() || []);
    const savepointsLite = await clientAPIS.default().getSavepoints({ lite: true, selector: flags['select']?.split(',').map((s) => s.trim()) });
    const selector = [...new Set(localSchema.databases(false).concat(savepointsLite.map((sc) => sc.name)))];
    const upstreamSchema = selector.length && await clientAPIS.default().schema({ depth: 2, selector });
    if (upstreamSchema.length) {
        for (const dbName of selector) {
            const upstreamDB = upstreamSchema.database(dbName);
            if (upstreamDB) {
                localSchema.database({ ...upstreamDB.jsonfy(), version: savepointsLite.find((v) => upstreamDB.identifiesAs(v.name))?.version_tag || 0 });
            } else localSchema.database(dbName, false);
        }
        console.log(`\nDone.`);
        const schemaJson = localSchema.jsonfy({ nodeNames: false });
        fileAPIS.schema().write(schemaJson);
    } else if (!flags['live']) notFoundExit();
    // Enter live mode?
    if (flags['live']) {
        console.log(`Live refresh active...`);
        clientAPIS.default().listen('savepoints', (e) => {
            const payload = JSON.parse(e.payload);
            if (payload.action === 'DELETE') return;
            console.log(`\n----------\n`);
            // ------
            const version_state = payload.body.version_state;
            const version_state_title = _toTitle(version_state);
            const dbNameBeforeChange = version_state === 'rollback' && payload.body.$name || payload.body.name;
            const { version_tag, [`${version_state}_desc`]: desc, [`${version_state}_ref`]: ref, [`${version_state}_pid`]: pid } = payload.body;
            console.log(`New ${version_state} event on database "${dbNameBeforeChange}" ${version_state === 'rollback' ? 'from' : 'to'} version ${version_tag}. ${version_state_title} desc: "${desc}". ${version_state_title} ref: "${ref}". ${version_state_title} PID: "${pid}".`);
            // ------
            const savepoint = new Savepoint(clientAPIS.default(), payload.body);
            const rootCDL = RootCDL.fromJSON(clientAPIS.default(), { actions: [savepoint.querify()] });
            const rootSchema = RootSchema.fromJSON(clientAPIS.default(), fileAPIS.schema().read() || []);
            const schemaJson = rootSchema.alterWith(rootCDL, { diff: false }).jsonfy({ nodeNames: false });
            fileAPIS.schema().write(schemaJson);
        });
    } else process.exit();
}

async function generate() {
    const localSchema = RootSchema.fromJSON(clientAPIS.default(), fileAPIS.schema().read() || []);
    const schemaSelector = getResolvedSchemaSelector();
    const savepointsLite = await clientAPIS.default().getSavepoints({ lite: true });
    for (const v of savepointsLite) schemaSelector.set(v.name, `!${v.name}`);
    const upstreamSchema = await clientAPIS.default().schema({ depth: 2, selector: [...schemaSelector.values()] });
    if (upstreamSchema.length) {
        for (const dbSchema of upstreamSchema) {
            localSchema.database({ ...dbSchema.jsonfy(), version: 0 });
        }
        console.log(`\nDone.`);
        const schemaJson = localSchema.jsonfy({ nodeNames: false });
        fileAPIS.schema().write(schemaJson);
    } else notFoundExit();
    process.exit();
}

async function replicate() {
    let historiesJson1, historiesJson2, targetClient;
    if (flags['online']) {
        historiesJson1 = await clientAPIS.default().getSavepoints({ histories: true });
        historiesJson2 = await clientAPIS.remote().getSavepoints({ histories: true });
        let targetClient1 = clientAPIS.default();
        let targetClient2 = clientAPIS.remote();
        if (flags['swap']) {
            [historiesJson1, historiesJson2, targetClient1, targetClient2] = [historiesJson2, historiesJson1, targetClient2, targetClient1];
        }
        targetClient = targetClient2;
    } else if (flags['offline']) {
        historiesJson1 = fileAPIS.histories().read();
        historiesJson2 = await clientAPIS.default().getSavepoints({ histories: true });
        targetClient = clientAPIS.default();
    } else {
        console.log(`Neither the --origin flag nor the --histories flag has been specified. Aborting.`);
        process.exit();
    }
    const targetClientLinkedDB = await targetClient.linkedDB();
    const targetSavepointsTable = targetClientLinkedDB.table('savepoints');
    const historiesByTag1 = byTag(historiesJson1);
    const historiesByTag2 = byTag(historiesJson2);
    let replications = 0;
    await handleTags(historiesByTag1, historiesByTag2, {});
    // ------------
    function byTag(histories) {
        const historiesByTag = new Map;
        for (const savepointJson of histories) {
            const savepoint = Savepoint.fromJSON(targetClient, savepointJson);
            if (!historiesByTag.has(savepoint.databaseTag())) historiesByTag.set(savepoint.databaseTag(), new Map);
            historiesByTag.get(savepoint.databaseTag()).set(savepoint.versionTag(), savepoint);
        }
        return historiesByTag;
    }
    async function handleTags(historiesByTag1, historiesByTag2, params) {
        const databaseTags = $sort('asc', new Set([...historiesByTag1.keys(), ...historiesByTag2.keys()]));
        for (const dbTag of databaseTags) {
            const tag1History = historiesByTag1.get(dbTag);
            const tag2History = historiesByTag2.get(dbTag);
            if (!tag1History) {
                await handleUpstreamChanges(dbTag, tag2History);
            } else await handleVersions(tag1History, tag2History, params);
        }
    }
    async function handleVersions(tag1History, tag2History, params) {
        const tagVersions = $sort('asc', new Set([...tag1History.keys(), ...tag2History.keys()]));
        const rollbackList = new Set;
        for (const tagVersion of tagVersions) {
            replications++;
            const savepoint1 = tag1History.get(tagVersion);
            const savepoint2 = tag2History.get(tagVersion);
            if (!savepoint1) {
                // Already rollback? Just splice... or save in rollback list
                if (savepoint2.versionState() === 'rollback') {
                    await spliceSavepoint(savepoint2);
                } else if ($versionUp(tagVersion, [...tag1History.keys()])) {
                    rollbackList.add(savepoint2);
                } else await handleUpstreamChanges(savepoint2.databaseTag(), savepoint2);
                continue;
            }
            if (!savepoint2) {
                // Do splicing... before create new savepoint
                await rollbackSavepoints(rollbackList, true);
                rollbackList.clear();
                await createSavepoint(savepoint1);
                continue;
            }
            if ($compare(savepoint1, savepoint2)) {
                if (savepoint1.versionState() === savepoint2.versionState()) continue;
                // Currently rollback? Rollforward... or save in rollback list
                if (savepoint2.versionState() === 'rollback') {
                    await rollforwardSavepoint(savepoint2);
                } else rollbackList.add(savepoint2);
            } else await handleUnrelatedHistories(savepoint1, savepoint2);
        }
        // Rollback pending savepoints in rollback list
        await rollbackSavepoints(rollbackList);
        rollbackList.clear();
    }
    // ------------
    async function rollforwardSavepoint(savepoint2) {
        console.log(`Rolling forward ${savepoint2.name()}@${savepoint2.versionDown()} -> ${savepoint2.name(true)}@${savepoint2.versionTag()}`);
        await savepoint2.recommit();
    }
    async function rollbackSavepoints(savepoints, splice = false) {
        for (const savepoint2 of $sort('desc', savepoints, 'versionTag')) {
            console.log(`Rolling back ${savepoint2.name(true)}@${savepoint2.versionDown()} <- ${savepoint2.name()}@${savepoint2.versionTag()}`);
            await savepoint2.rollback();
            if (splice) await spliceSavepoint(savepoint2);
        }
    }
    async function spliceSavepoint(savepoint2) {
        console.log(`Splicing ${savepoint2.name()}@${savepoint2.versionTag()}`);
        await targetSavepointsTable.delete({ where: (q) => q.eq('id', (q) => q.value(savepoint2.id())) });
    }
    async function createSavepoint(savepoint1) {
        console.log(`Creating ${savepoint1.name()}@${savepoint1.versionTag()}`);
        if (savepoint1.versionState() === 'commit') {
            await targetClient.withMode('replication', () => targetClient.query(savepoint1.querify()));
        }
        const versionState = savepoint1.versionState();
        const savepointJson = {
            ...savepoint1.jsonfy(),
            [`${versionState}_date`]: q => q.now(),
            [`${versionState}_ref`]: targetClient.params.commitRef || savepoint1[`${versionState}Ref`](),
            [`${versionState}_pid`]: q => q.fn(targetClient.params.dialect === 'mysql' ? 'connection_id' : 'pg_backend_pid'),
        };
        delete savepointJson.version_tags;
        delete savepointJson.cascades;
        await targetSavepointsTable.insert(savepointJson);
    }
    // ------------
    async function handleUnrelatedHistories(savepoint1, savepoint2) {
        throw new Error(`Unrelated histories: ${savepoint1.name()}@${savepoint1.versionTag()}:${savepoint2.name()}@${savepoint2.versionTag()}`);
    }
    async function handleUpstreamChanges(dbTag, savepoint_s) {
        const activeSavepoint = savepoint_s instanceof Map 
            ? [...savepoint_s].filter((sv) => sv.versionState() === 'commit').reduce((prev, sv) => prev?.versionTag() > sv.versionTag() ? prev : sv, null)
            : savepoint_s;
        throw new Error(`Unexpected changes in target database: ${activeSavepoint.name()}@${activeSavepoint.versionTag()} (${dbTag})`);
    }
    function $versionUp(v, versions) {
        return versions.reduce((prev, $v) => prev || ($v > v ? $v : 0), 0);
    }
    function $compare(savepoint1, savepoint2) {
        const getFields = (sv) => {
            const { name, $name, tables, status } = sv.jsonfy();
            return { name, $name, tables, status };
        };
        const $savepoint1 = getFields(savepoint1);
        const $savepoint2 = getFields(savepoint2);
        return $eq($savepoint1, $savepoint2);
    }
    function $sort(dir, entries, key) {
        const compare = (a, b) => typeof a === 'number' ? a - b : a.localeCompare(b);
        return ((sorted) => dir === 'desc' ? sorted.reverse() : sorted)([...entries].sort((a, b) => key ? compare(a[key](), b[key]()) : compare(a, b)));
    }
    // ------------
    console.log(`\n${replications} savepoint records processed.`);
    if (!clientAPIS.remote()) await refresh();
    else console.log(`\nDone.`);
    process.exit();
}
