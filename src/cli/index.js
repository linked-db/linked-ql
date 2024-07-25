#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import enquirer from 'enquirer';
import { parseArgv } from "./util.js";
import CreateStatement from '../lang/ddl/create/CreateStatement.js';
import DropStatement from '../lang/ddl/drop/DropStatement.js';
import DatabaseSchema from '../lang/schema/db/DatabaseSchema.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);
// flags: --desc --direction --db, --dir, --force, --diffing, --force-new
if (flags.direction && !['forward','backward'].includes(flags.direction)) throw new Error(`Invalid --direction. Expected: forward|backward`);
const dir = flags.dir || './database/';

// ------
// Load driver
let driver, driverFile = path.resolve(dir, 'driver.js');
if (!fs.existsSync(driverFile) || !(driver = await (await import(url.pathToFileURL(driverFile))).default?.())) {
    console.log(`\nNo driver has been configured at ${ driverFile }. Aborting.`);
    process.exit();
}

// ------
// Load schema file
let schema, schemaFile = path.resolve(dir, 'schema.json');
if ((!fs.existsSync(schemaFile) || !(schema = JSON.parse(fs.readFileSync(schemaFile).toString().trim() || '[]'))) && command !== 'refresh') {
    console.log(`\nNo schemas have been defined at ${ schemaFile }. Aborting.`);
    process.exit();
}

// ------
// Leaderboard?
if (command === 'leaderboard') {
    const savepoints = await driver.getSavepoints({ name: flags.db, direction: flags.direction });
    console.table(savepoints.map(sv => sv.toJson()), ['name', 'databaseTag', 'versionTag', 'versionMax', 'cursor', 'description', 'savepointDate', 'rollbackDate', 'rollbackEffect']);
    process.exit();
}

// ------
// Generate?
if (command === 'refresh') {
    const dbSchemas = await Promise.all((await driver.getSavepoints({ name: flags.db, direction: flags.direction })).filter(svp => svp.keep !== false).map(async svp => {
        const { name, ...rest } = await driver.describeDatabase(svp.name());
        return { name, version: svp.versionTag, ...rest, ...(flags.diffing === 'stateful' ? { keep: true } : {}) };
    }));
    if (!dbSchemas.length) {
        console.log(`No Linked QL records found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
        process.exit();
    }
    let proceed = !schema.length || flags.auto;
    if (!proceed) {
        console.log(`Your local schema file is not empty and will be overwritten!`);
        proceed = (await enquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed?'
        })).proceed;
    }
    if (!proceed) process.exit();
    fs.writeFileSync(schemaFile, JSON.stringify(dbSchemas, null, 3));
    console.log(`\nDone.`);
    console.log(`\nLocal schema updated: ${ driverFile }`);
    process.exit();
}

// ------
// Erase?
if (command === 'forget') {
    let dbSavepoint;
    if (flags.db && !(dbSavepoint = await driver.database(flags.db).savepoint())) {
        console.log(`No Linked QL records found for database ${ flags.db }. Aborting.`);
        process.exit();
    }
    console.log(`\nThis will permanently erase savepoint records for ${ flags.db ? `${ flags.db }@${ dbSavepoint.versionTag }` : 'all databases' }.`);
    const proceed = flags.auto || (await enquirer.prompt({
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed?'
    })).proceed;
    if (!proceed) process.exit();
    if (flags.db) await driver.database(driver.constructor.OBJ_INFOSCHEMA_DB).table('database_savepoints').delete({ database_tag: dbSavepoint.databaseTag });
    else await driver.dropDatabase(driver.constructor.OBJ_INFOSCHEMA_DB, { ifExists: true, cascade: true, noCreateSavepoint: true });
    console.log(`\nDone.`);
    process.exit();
}

// ------
// Schemas before and after
const dbSchemas = [].concat(schema), resultDbSchemas = [];

// ------
// Run migrations or rollbacks
if (command === 'migrate') {
    if (flags.diffing !== 'stateful' && (!flags.db || !dbSchemas.find(sch => sch.name === flags.db))) {
        const savepoints = await driver.getSavepoints({ name: flags.db, direction: flags.direction });
        dbSchemas.push(...savepoints.filter(savepoint => !dbSchemas.find(sch => sch.name === savepoint.name())).map(savepoint => ({ name: savepoint.name(), version: savepoint.versionTag, keep: false })));
    }
    const dbList = flags.db ? dbSchemas.filter(sch => sch.name === flags.db) : dbSchemas;
    if (!dbList.length) {
        console.log(`No Linked QL ${ flags.direction === 'forward' ? 'roll-forward' : 'rollback' } records found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
        process.exit();
    }
    for (const dbSchema of dbSchemas) {
        if (flags.db && flags.db !== dbSchema.name) {
            resultDbSchemas.push(dbSchema);
            continue;
        }
        const postMigration = { name: dbSchema.name, migrateEffect: null, returnValue: undefined };
        let schema = DatabaseSchema.fromJson(driver, dbSchema);
        if (flags.diffing === 'stateful') {
            // Force "keep" to undefined for new?
            if (typeof schema.keep() === 'boolean' && flags['force-new']) schema.keep(undefined, true);
        } else {
            const schemaExisting = await driver.describeDatabase(dbSchema.name);
            if (schemaExisting) schema = DatabaseSchema.fromJson(driver, schemaExisting).keep(true, true).diffWith(schema);
        }
        if (schema.keep() === false) {
            console.log(`\nDropping database ${ dbSchema.name }@${ dbSchema.version }`);
            const dropQuery = DropStatement.fromJson(driver, { kind: 'SCHEMA', name: dbSchema.name }).withFlag('CASCADE');
            if (!flags.quiet) console.log(`\nSQL preview:\n${ dropQuery }\n`);
            const proceed = flags.auto || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.query(dropQuery, { description: flags.desc });
                postMigration.migrateEffect = 'DROP';
            }
        }
        if (schema.keep() === true) {
            const altQuery = schema.getAlt().with({ resultSchema: schema });
            if (altQuery.length) {
                console.log(`\nAltering database ${ dbSchema.name }@${ dbSchema.version }`);
                if (!flags.quiet) console.log(`\nSQL preview:\n${ altQuery }\n`);
                const proceed = flags.auto || (await enquirer.prompt({
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Proceed?'
                })).proceed;
                if (proceed) {
                    postMigration.returnValue = await driver.query(altQuery, { description: flags.desc });
                    postMigration.name = dbSchema.$name || dbSchema.name;
                    postMigration.migrateEffect = 'ALTER';
                }
            } else console.log(`\nNo alterations have been made to schema: ${ dbSchema.name }. Skipping.`);
        }
        if (typeof schema.keep() !== 'boolean'){
            const createQuery = CreateStatement.fromJson(driver, { kind: 'SCHEMA', argument: schema });
            console.log(`\nCreating database ${ dbSchema.name }`);
            if (!flags.quiet) console.log(`\nSQL preview:\n${ createQuery }\n`);
            const proceed = flags.auto || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.query(createQuery, { description: flags.desc });
                postMigration.migrateEffect = 'CREATE';
            }
        }
        if (['CREATE', 'ALTER'].includes(postMigration.migrateEffect)) {
            const newSchema = await driver.describeDatabase(postMigration.name);
            const newSchemaInstance = DatabaseSchema.fromJson(driver, newSchema);
            if (flags.diffing === 'stateful') newSchemaInstance.keep(true, true);
            const { name, tables, keep } = newSchemaInstance.toJson();
            resultDbSchemas.push({ name, version: postMigration.returnValue.versionTag, tables, keep });
        } else if (postMigration.migrateEffect !== 'DROP') resultDbSchemas.push(dbSchema);
    }
}

// Do rollbacks
if (command === 'rollback') {
    const savepoints = await driver.getSavepoints({ direction: flags.direction });
    const dbList = flags.db ? savepoints.filter(svp => svp.name() === flags.db) : savepoints;
    if (!dbList.length) {
        console.log(`No Linked QL ${ flags.direction === 'forward' ? 'roll-forward' : 'rollback' } records found for${ !flags.db ? ' any' : '' } database${ flags.db ? ` ${ flags.db }` : '' }. Aborting.`);
        process.exit();
    }
    resultDbSchemas.push(...dbSchemas);
    for (const savepoint of savepoints) {
        if (flags.db && flags.db !== savepoint.name()) {
            continue;
        }
        const postRollback = { versionTag: savepoint.versionTag - (savepoint.direction === 'forward' ? 0 : 1), returnValue: undefined };
        console.log(`\nRolling ${ flags.direction === 'forward' ? 'forward' : 'back' } database ${ savepoint.name() } to version ${ postRollback.versionTag }. (This will mean ${ savepoint.rollbackEffect === 'DROP' ? 'dropping' : (savepoint.rollbackEffect === 'RECREATE' ? 'recreating' : 'altering') } the database.)`);
        if (!flags.quiet) console.log(`\nSQL preview:\n${ savepoint.rollbackQuery }\n`);
        const proceed = flags.auto || (await enquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed?'
        })).proceed;
        if (proceed) { postRollback.returnValue = await savepoint.rollback(); }
        if (proceed && savepoint.rollbackEffect === 'DROP') {
            const existing = resultDbSchemas.findIndex(sch => sch.name === savepoint.name());
            if (existing > -1) resultDbSchemas.splice(existing, 1);
         } else if (proceed) {
            const newSchema = await driver.describeDatabase(savepoint.name(true));
            const newSchemaInstance = DatabaseSchema.fromJson(driver, newSchema);
            if (flags.diffing === 'stateful') newSchemaInstance.keep(true, true);
            const { name, tables, keep } = newSchemaInstance.toJson();
            const $newSchema = { name, version: postRollback.versionTag, tables, keep };
            const existing = resultDbSchemas.findIndex(sch => sch.name === savepoint.name());
            if (existing > -1) resultDbSchemas[existing] = $newSchema;
            else resultDbSchemas.push($newSchema);
        }
    }
}

// Updating schema
if (['migrate', 'rollback'].includes(command)) {
    fs.writeFileSync(schemaFile, JSON.stringify(resultDbSchemas, null, 3));
    console.log(`\nDone.`);
    console.log(`\nLocal schema updated: ${ driverFile }`);
    process.exit();
}