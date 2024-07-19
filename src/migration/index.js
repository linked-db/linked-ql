#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import enquirer from 'enquirer';
import { parseArgv } from "./util.js";
import SQLClient from '../api/sql/SQLClient.js';
import CreateDatabase from '../query/create/CreateDatabase.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);
// flags: --preview, --desc, --force --db, --schema, --driver, --force-new
if (flags.direction && !['forward','backward'].includes(flags.direction)) throw new Error(`Invalid --direction. Expected: forward|backward`);

// ------
// Load schema file
let schema, schemaFile = path.resolve(flags['schema'] || './database/schema.json');
if (!fs.existsSync(schemaFile) || !(schema = JSON.parse(fs.readFileSync(schemaFile)))) {
    console.log(`\nNo schemas have been defined at ${ schemaFile }. Aborting.`);
    process.exit();
}

// ------
// Load driver
let driver, driverFile = path.resolve(flags['driver'] || './database/driver.js');
if (!fs.existsSync(driverFile) || !(driver = await (await import(url.pathToFileURL(driverFile))).default?.())) {
    console.log(`\nNo driver has been configured at ${ driverFile }. Aborting.`);
    process.exit();
}

// ------
// Show?
if (command === 'savepoints') {
    //TEMP:console.log('DATABASES:', await driver.databases());
    //TEMP:console.log('SAVEPOINTS:', await driver.database(SQLClient.OBJ_INFOSCHEMA_DB).table('database_savepoints').select());
    const savepointSummaries = await driver.getSavepoints({ direction: flags.direction });
    console.table(savepointSummaries.map(sv => sv.toJson()), ['name', 'database_tag', 'version_tag', 'version_max', 'cursor', 'description', 'savepoint_date', 'rollback_date']);
    process.exit();
}

// ------
// Schemas before and after
const dbSchemas = [].concat(schema), resultDbSchemas = [];

// ------
// Run migrations or rollbacks
if (command === 'migrate') {
    for (const dbSchema of dbSchemas) {
        if (flags.db && flags.db !== dbSchema.name) {
            resultDbSchemas.push(dbSchema);
            continue;
        }
        const postMigration = { name: dbSchema.name, outcome: null, returnValue: undefined };
        const dbInstance = CreateDatabase.fromJson(driver, dbSchema);

        if (dbInstance.keep() === false && !flags['force-new']) {
            console.log(`\nDropping database: ${ dbSchema.name }`);
            if (flags.preview !== false) console.log(`\nSQL preview:\nDROP SCHEMA ${ dbSchema.name } CASCADE\n`);
            const proceed = flags.force || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.dropDatabase(dbSchema.name, { cascade: true, description: flags.desc });
                postMigration.outcome = 'DROPPED';
            }
        }

        if (dbInstance.keep() === true && !flags['force-new']) {
            const alt = dbInstance.getAlt().with({ resultSchema: dbInstance });
            if (alt.ACTIONS.length) {
                console.log(`\nAltering database: ${ dbSchema.name }`);
                if (flags.preview !== false) console.log(`\nSQL preview:\n${ alt }\n`);
                const proceed = flags.force || (await enquirer.prompt({
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Proceed?'
                })).proceed;
                if (proceed) {
                    postMigration.returnValue = await driver.query(alt, { description: flags.desc });
                    postMigration.name = dbSchema.$name || dbSchema.name;
                    postMigration.outcome = 'ALTERED';
                }
            } else console.log(`\nNo alterations have been made to schema: ${ dbSchema.name }. Skipping.`);
        }

        if (typeof dbInstance.keep() !== 'boolean' || flags['force-new']){
            if (typeof dbInstance.keep() === 'boolean' && flags['force-new']) dbInstance.keep(undefined, true); // Force "keep" to undefined for new?
            console.log(`\nCreating database: ${ dbSchema.name }`);
            if (flags.preview !== false) console.log(`\nSQL preview:\n${ dbInstance }\n`);
            const proceed = flags.force || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                postMigration.returnValue = await driver.query(dbInstance, { description: flags.desc });
                postMigration.outcome = 'CREATED';
            }
        }

        if (['CREATED', 'ALTERED'].includes(postMigration.outcome)) {
            const newSchema = await driver.describeDatabase(postMigration.name, '*');
            const { name, tables, keep } = CreateDatabase.fromJson(driver, newSchema).keep(true, true).toJson();
            resultDbSchemas.push({ name, version: postMigration.returnValue.versionTag, tables, keep });
        } else if (postMigration.outcome !== 'DROPPED') resultDbSchemas.push(dbSchema);
    }
}

// Do rollbacks
if (command === 'rollback') {
    resultDbSchemas.push(...dbSchemas);

    const savepointSummaries = await driver.getSavepoints({ direction: flags.direction });
    for (const savepoint of savepointSummaries) {
        if (flags.db && flags.db !== savepoint.name()) {
            continue;
        }
        const postRollback = { returnValue: undefined };
        console.log(`\nRolling ${ flags.direction === 'forward' ? 'forward' : 'back' } database: ${ savepoint.name() }. (This database will now be ${ savepoint.rollbackOutcome.toLowerCase() })`);
        if (flags.preview !== false) {
            console.log(`\nSavepoint details:\n`);
            console.table(savepoint.toJson());
        }
        const proceed = flags.force || (await enquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed?'
        })).proceed;
        if (proceed) { postRollback.returnValue = await savepoint.rollback(); }

        if (proceed && savepoint.rollbackOutcome === 'DROPPED') {
            const existing = resultDbSchemas.findIndex(sch => sch.name === savepoint.name());
            if (existing > -1) resultDbSchemas.splice(existing, 1);
         } else if (proceed) {
           const newSchema = await driver.describeDatabase(savepoint.name(true), '*');
           const { name, tables, keep } = CreateDatabase.fromJson(driver, newSchema).keep(true, true).toJson();
           const $newSchema = { name, version: savepoint.versionTag - (savepoint.direction === 'forward' ? 0 : 1), tables, keep };
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

// ------
// Reset?
if (command === 'reset-savepoints') {
    console.log(`\nThis will permanently delete all savepoint records$.`);
    if (flags.db) console.log(`\nThis will also drop the database: ${ flags.db }.`); // For testing purposes only
    const proceed = flags.force || (await enquirer.prompt({
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed?'
    })).proceed;
    if (proceed) {
        if (flags.db) await driver.query(`DROP DATABASE IF EXISTS ${ flags.db } CASCADE`, { noCreateSavepoint: true });
        await driver.query(`DROP DATABASE IF EXISTS obj_information_schema CASCADE`, { noCreateSavepoint: true });
    }
    process.exit();
}