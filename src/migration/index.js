#!/usr/bin/env node

/**
 * THIS IS A WORK IN PROGRESS
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { parseArgv } from "./util.js";
import SQLClient from '../api/sql/SQLClient.js';
import CreateDatabase from '../query/create/CreateDatabase.js';

// Parse argv
const { command, flags } = parseArgv(process.argv);

// Load schema file
let schema, schemaFile = path.resolve(flags['schema'] || './database/schema.json');
if (!fs.existsSync(schemaFile) || !(schema = JSON.parse(fs.readFileSync(schemaFile)))) {
    console.log(`\nNo schemas have been defined at ${ schemaFile }. Aborting.`);
    process.exit();
}

// Load driver
let driver, driverFile = path.resolve(flags['driver'] || './database/driver.js');
if (!fs.existsSync(driverFile) || !(driver = await (await import(url.pathToFileURL(driverFile))).default?.())) {
    console.log(`\nNo driver has been configured at ${ driverFile }. Aborting.`);
    process.exit();
}

if (command === 'show') {
    console.log('\nDatabases:', await driver.databases());
    process.exit();
}

if (command === 'fresh') {
    await driver.dropDatabase('test_db', { ifExists: true, cascade: true, noCreateSavepoint: true });
    await driver.dropDatabase('test_db2', { ifExists: true, cascade: true, noCreateSavepoint: true });
    process.exit();
}

// Run migrations
const database = CreateDatabase.fromJson(driver, schema);
let dbName = database.name();
if (command === 'migrate') {
    if (database.status() === 'DOWN') {
        console.log(`\nDropping database ${ dbName }`);
        await driver.dropDatabase(dbName);
    } else if (database.status() === 'UP') {
        const alt = database.getAlt().with({ resultSchema: database });
        if (!alt.ACTIONS.length) {
            console.log(`\nNo alterations have been made to schema. Aborting.`);
            process.exit();
        }
        console.log(`\nAltering database ${ dbName }`);
        if (flags.show !== false) console.log(`\nRunning the following SQL:\n${ alt }`);
        await driver.query(alt);
    } else {
        console.log(`\nCreating database ${ dbName }`);
        if (flags.show !== false) console.log(`\nRunning the following SQL:\n${ database }`);
        await driver.query(database);
    }
}

if (['rollback', 'rollforward'].includes(command)) {
    console.log(`\nRolling ${ command === 'rollforward' ? 'forward' : 'back' } database ${ dbName }`);
    const savepoint = await driver.database(dbName).savepoint({ direction: command === 'rollforward' ? 'forward' : null });
    if (!savepoint) {
        console.log(`\nNo${ command === 'rollforward' ? 'forward ' : '' } savepoints found for database ${ dbName }. Aborting.`);
        process.exit();
    }
    await savepoint.rollback();
    dbName = savepoint.toJson()[command === 'rollforward' ? '$name' : 'name'] || dbName;
}

// Updating schema
console.log(`\nUpdating local schema at ${ driverFile }`);
const newSchema = await driver.describeDatabase(dbName, '*');
const $newSchema = CreateDatabase.fromJson(driver, newSchema).status('UP', 'UP').toJson();
fs.writeFileSync(schemaFile, JSON.stringify($newSchema, null, 3));

console.log(`\nDone.`);
process.exit();