#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import YAML from 'yaml';
import enquirer from 'enquirer';
import { parseArgv } from "./util.js";
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);
if (flags['with-env']) await import('dotenv/config');

// flags: --desc --direction --db, --dir, --force, --diffing, --force-new
if (flags.auto) flags.yes = true;
const yesFlagNotice = flags.yes ? ` (--yes!)` : '';
if (flags.direction && !['forward','backward'].includes(flags.direction)) throw new Error(`Invalid --direction. Expected: forward|backward`);
const dir = flags.dir || './database/';

// ------
// Load driver
let driver, driverFile;
if (!fs.existsSync(driverFile = path.resolve(dir, 'driver.js')) || !(driver = await (await import(url.pathToFileURL(driverFile))).default?.())) {
    console.log(`\nNo driver has been configured at ${ driverFile }. Aborting.`);
    process.exit();
}

// ------
// Load schema file
let schemaDoc, schemaFile, existed = true;
if ((!fs.existsSync(schemaFile = path.resolve(dir, 'schema.yml')) || !(schemaDoc = YAML.parse(fs.readFileSync(schemaFile).toString().trim())))
&& (!fs.existsSync(schemaFile = path.resolve(dir, 'schema.json')) || !(schemaDoc = JSON.parse(fs.readFileSync(schemaFile).toString().trim() || 'null')))) {
    console.log(`\nNo schemas have been defined at ${ dir }, but this may be automatically created for you.`);
    schemaFile = path.resolve(dir, 'schema.yml');
    schemaDoc = [];
    existed = false;
}

// ------
// Schemas before and after
let originalSchemaDoc = [].concat(schemaDoc), resultSchemaDoc = [];
function writeResultSchemaDoc() {
    fs.writeFileSync(schemaFile, (schemaFile.endsWith('.yml') ? YAML : JSON).stringify(resultSchemaDoc, null, 3));
    console.log(`\nDone.`);
    console.log(`\nLocal schema ${ existed ? 'updated' : 'generated' }: ${ schemaFile }`);
}

// ------
// Generate/refresh?
if (['generate', 'refresh'].includes(command)) {
    resultSchemaDoc.push(...originalSchemaDoc);
    let recordsFound;
    const removeEntry = async dbName => {
        const existing = resultSchemaDoc.findIndex(sch => sch.name === dbName);
        if (existing > -1) {
            console.log(`An orphaned database entry "${ dbName }" found in your local schema file and will now be removed!${ yesFlagNotice }`);
            const proceed = flags.yes || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) resultSchemaDoc.splice(existing, 1);
        }
        recordsFound = true;
    };
    const addEntry = async dbSchema => {
        const existing = resultSchemaDoc.findIndex(sch => sch.name === dbSchema.name);
        if (existing > -1) {
            console.log(`An existing database entry "${ dbSchema.name }" found in your local schema file and will now be overwritten!${ yesFlagNotice }`);
            const proceed = flags.yes || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) { resultSchemaDoc[existing] = dbSchema; }
        } else resultSchemaDoc.push(dbSchema);
        recordsFound = true;
    };
    const svps = await driver.savepoints({ name: flags.db, direction: flags.direction });
    for (const svp of svps) {
        if (svp.keep !== false) {
            const schema = await driver.database(svp.name()).schema();
            if (!schema) continue; // Savepoint record orphaned as DB may have been droped outside of Linked QL
            const { name, ...rest } = schema.toJSON();
            const newSchema = { name, version: svp.versionTag, ...rest, ...(flags.diffing === 'stateful' ? { keep: true } : {}) };
            await addEntry(newSchema);
        } else await removeEntry(svp.name());
    }
    if (command === 'generate' && !svps.length && flags.db) {
        const $schema = (await driver.database(flags.db).schema()).toJSON();
        if ($schema) await addEntry({ name: $schema.name, version: 0, tables: $schema.tables, ...(flags.diffing === 'stateful' ? { keep: true } : {}) });
    }
    if (recordsFound) {
        writeResultSchemaDoc();
    } else console.log(`No schemas found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
    process.exit();
}

// ------
// Clear histories?
if (['clear-histories', 'forget'/*depreciated*/].includes(command)) {
    let dbSavepoint;
    if (flags.db && !(dbSavepoint = await driver.database(flags.db).savepoint())) {
        console.log(`No Linked QL records found for database ${ flags.db }. Aborting.`);
        process.exit();
    }
    console.log(`\nThis will permanently erase savepoint records for ${ flags.db ? `${ flags.db }@${ dbSavepoint.versionTag }` : 'all databases' }!${ yesFlagNotice }`);
    const proceed = flags.yes || (await enquirer.prompt({
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed?'
    })).proceed;
    if (!proceed) process.exit();
    const linkedDB = await driver.linkedDB();
    const savepointsTable = await linkedDB.savepointsTable();
    await savepointsTable.delete({ where: flags.db ? { database_tag: dbSavepoint.databaseTag } : true });
    console.log(`\nDone.`);
    process.exit();
}

// ------
// State?
if (['state', 'leaderboard'/*depreciated*/].includes(command)) {
    const savepoints = await driver.savepoints({ name: flags.db, direction: flags.direction });
    console.table(savepoints.map(sv => sv.toJSON()), ['name', 'databaseTag', 'versionTag', 'versionMax', 'cursor', 'description', 'savepointDate', 'rollbackDate', 'rollbackEffect']);
    process.exit();
}

// ------
// Run migrations or rollbacks
if (['commit', 'migrate'/*depreciated*/].includes(command)) {
    if (flags.diffing !== 'stateful' && (!flags.db || !originalSchemaDoc.find(sch => sch.name === flags.db))) {
        const savepoints = await driver.savepoints({ name: flags.db, direction: flags.direction });
        originalSchemaDoc.push(...savepoints.filter(savepoint => !originalSchemaDoc.find(sch => sch.name === savepoint.name())).map(savepoint => ({ name: savepoint.name(), version: savepoint.versionTag, keep: false })));
    }
    const dbList = flags.db ? originalSchemaDoc.filter(sch => sch.name === flags.db) : originalSchemaDoc;
    if (!dbList.length) {
        console.log(`No Linked QL ${ flags.direction === 'forward' ? 'roll-forward' : 'rollback' } records found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
        process.exit();
    }
    if (!flags.desc && flags.yes) throw new Error(`Command missing the --desc parameter.`);
    const description = flags.desc || (await enquirer.prompt({
        type: 'text',
        name: 'description',
        message: 'Enter commit description:'
    })).description;
    for (const dbSchema of originalSchemaDoc) {
        if (flags.db && flags.db !== dbSchema.name) {
            resultSchemaDoc.push(dbSchema);
            continue;
        }
        const postMigration = { name: dbSchema.name, migrateEffect: null, returnValue: undefined };
        let schemaApi = DatabaseSchema.fromJSON(driver, dbSchema);
        if (flags.diffing === 'stateful') {
            // Force "keep" to undefined for new?
            if (typeof schemaApi.keep() === 'boolean' && flags['force-new']) schemaApi.keep(undefined, true);
        } else {
            const schemaExisting = await driver.database(dbSchema.name).schema();
            if (schemaExisting) schemaApi = schemaExisting.keep(true, true).diffWith(schemaApi);
        }
        if (schemaApi.keep() === false) {
            console.log(`\nDropping database ${ dbSchema.name }@${ dbSchema.version }!${ yesFlagNotice }`);
            const dropQuery = DropStatement.fromJSON(driver, { kind: 'SCHEMA', name: dbSchema.name });
            if (driver.params.dialect !== 'mysql') dropQuery.withFlag('CASCADE');
            if (!flags.quiet) console.log(`\nSQL preview:\n${ dropQuery }\n`);
            const proceed = flags.yes || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.query(dropQuery, { description });
                postMigration.migrateEffect = 'DROP';
            }
        }
        if (schemaApi.keep() === true) {
            const altQuery = schemaApi.getAlt().with({ resultSchema: schemaApi });
            if (altQuery.length) {
                console.log(`\nAltering database ${ dbSchema.name }@${ dbSchema.version }!${ yesFlagNotice }`);
                if (!flags.quiet) console.log(`\nSQL preview:\n${ altQuery }\n`);
                const proceed = flags.yes || (await enquirer.prompt({
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Proceed?'
                })).proceed;
                if (proceed) {
                    postMigration.returnValue = await driver.query(altQuery, { description });
                    postMigration.name = dbSchema.$name || dbSchema.name;
                    postMigration.migrateEffect = 'ALTER';
                }
            } else console.log(`\nNo alterations have been made to schema: ${ dbSchema.name }. Skipping.`);
        }
        if (typeof schemaApi.keep() !== 'boolean'){
            const createQuery = CreateStatement.fromJSON(driver, { kind: 'SCHEMA', argument: schemaApi });
            console.log(`\nCreating database ${ dbSchema.name }!${ yesFlagNotice }`);
            if (!flags.quiet) console.log(`\nSQL preview:\n${ createQuery }\n`);
            const proceed = flags.yes || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.query(createQuery, { description });
                postMigration.migrateEffect = 'CREATE';
            }
        }
        if (['CREATE', 'ALTER'].includes(postMigration.migrateEffect)) {
            const newSchemaInstance = await driver.database(postMigration.name).schema();
            if (flags.diffing === 'stateful') newSchemaInstance.keep(true, true);
            const { name, tables, keep } = newSchemaInstance.toJSON();
            resultSchemaDoc.push({ name, version: postMigration.returnValue.versionTag, tables, keep });
        } else if (postMigration.migrateEffect !== 'DROP') resultSchemaDoc.push(dbSchema);
    }
}

// Do rollbacks
if (['rollback'].includes(command)) {
    const savepoints = await driver.savepoints({ direction: flags.direction });
    const dbList = flags.db ? savepoints.filter(svp => svp.name() === flags.db) : savepoints;
    if (!dbList.length) {
        console.log(`No Linked QL ${ flags.direction === 'forward' ? 'roll-forward' : 'rollback' } records found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
        process.exit();
    }
    resultSchemaDoc.push(...originalSchemaDoc);
    for (const savepoint of savepoints) {
        if (flags.db && flags.db !== savepoint.name()) {
            continue;
        }
        const postRollback = { versionTag: savepoint.versionTag - (savepoint.direction === 'forward' ? 0 : 1), returnValue: undefined };
        console.log(`\nRolling ${ flags.direction === 'forward' ? 'forward' : 'back' } database ${ savepoint.name() } to version ${ postRollback.versionTag }. (This will mean ${ savepoint.rollbackEffect === 'DROP' ? 'dropping' : (savepoint.rollbackEffect === 'RECREATE' ? 'recreating' : 'altering') } the database!${ yesFlagNotice })`);
        if (!flags.quiet) console.log(`\nSQL preview:\n${ savepoint.rollbackQuery }\n`);
        const proceed = flags.yes || (await enquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed?'
        })).proceed;
        if (proceed) { postRollback.returnValue = await savepoint.rollback(); }
        if (proceed && savepoint.rollbackEffect === 'DROP') {
            const existing = resultSchemaDoc.findIndex(sch => sch.name === savepoint.name());
            if (existing > -1) resultSchemaDoc.splice(existing, 1);
         } else if (proceed) {
            const newSchemaInstance = await driver.database(savepoint.name(true)).schema();
            if (flags.diffing === 'stateful') newSchemaInstance.keep(true, true);
            const { name, tables, keep } = newSchemaInstance.toJSON();
            const $newSchema = { name, version: postRollback.versionTag, tables, keep };
            const existing = resultSchemaDoc.findIndex(sch => sch.name === savepoint.name());
            if (existing > -1) resultSchemaDoc[existing] = $newSchema;
            else resultSchemaDoc.push($newSchema);
        }
    }
}

// Updating schema
if (['commit', 'migrate'/*depreciated*/, 'rollback'].includes(command)) writeResultSchemaDoc();
process.exit();
