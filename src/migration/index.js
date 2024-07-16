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

// -------------
// Load schema file
let schema, schemaFile = path.resolve(flags['schema'] || './database/schema.json');
if (!fs.existsSync(schemaFile) || !(schema = JSON.parse(fs.readFileSync(schemaFile)))) {
    console.log(`\nNo schemas have been defined at ${ schemaFile }. Aborting.`);
    process.exit();
}

// -------------
// Load driver
let driver, driverFile = path.resolve(flags['driver'] || './database/driver.js');
if (!fs.existsSync(driverFile) || !(driver = await (await import(url.pathToFileURL(driverFile))).default?.())) {
    console.log(`\nNo driver has been configured at ${ driverFile }. Aborting.`);
    process.exit();
}

// -------------
// Show?
if (command === 'status') {
    console.table(await driver.getSavepoints(), ['name', '$name', 'pos', 'version_tag', 'version_max', 'savepoint_description', 'savepoint_date', 'rollback_date']);
    process.exit();
}

// -------------
// Reset?
if (command === 'reset') {
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

// -------------
// Schemas before and after
const dbSchemas = [].concat(schema), newDbSchemas = [];

// -------------
// Run migrations
if (command === 'migrate') {
    for (const dbSchema of dbSchemas) {

        if (flags.db && flags.db !== dbSchema.name) {
            newDbSchemas.push(dbSchema);
            continue;
        }
        const scope = { dbName: dbSchema.name, returnValue: null };
        const dbInstance = CreateDatabase.fromJson(driver, dbSchema);

        if (dbInstance.status() === 'DOWN' && !flags['force-new']) {
            console.log(`\nDropping database: ${ scope.dbName }`);
            const proceed = flags.force || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                scope.returnValue = await driver.dropDatabase(scope.dbName, { savepointDesc: flags.desc });
                scope.isDrop = true;
            }
        }

        if (dbInstance.status() === 'UP' && !flags['force-new']) {
            const alt = dbInstance.getAlt().with({ resultSchema: dbInstance });
            if (alt.ACTIONS.length) {
                console.log(`\nAltering database: ${ scope.dbName }`);
                if (flags.preview !== false) console.log(`\nThe following SQL will now be run:\n${ alt }\n`);
                const proceed = flags.force || (await enquirer.prompt({
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Proceed?'
                })).proceed;
                if (proceed) {
                    scope.returnValue = await driver.query(alt, { savepointDesc: flags.desc });
                    scope.postName = dbSchema.$name || dbSchema.name;
                }
            } else console.log(`\nNo alterations have been made to schema: ${ scope.dbName }. Skipping.`);
        }

        if (!dbInstance.status() || flags['force-new']){
            if (dbInstance.status() && flags['force-new']) dbInstance.status(undefined, true); // Force status to new?
            console.log(`\nCreating database: ${ scope.dbName }`);
            if (flags.preview !== false) console.log(`\nThe following SQL will now be run:\n${ dbInstance }\n`);
            const proceed = flags.force || (await enquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Proceed?'
            })).proceed;
            if (proceed) {
                scope.returnValue = await driver.query(dbInstance, { savepointDesc: flags.desc });
                scope.postName = dbSchema.name;
            }
        }

        if (scope.postName) {
            const newSchema = await driver.describeDatabase(scope.postName, '*');
            const $newSchema = CreateDatabase.fromJson(driver, newSchema).status('UP', 'UP').toJson();
            newDbSchemas.push($newSchema);
        } else if (!scope.isDrop) newDbSchemas.push(dbSchema);
    }
}

// -------------
// Do rollbacks
if (['rollback', 'rollforward'].includes(command)) {
    newDbSchemas.push(...dbSchemas);

    const savepointSummaries = await driver.getSavepoints({ direction: command === 'rollforward' ? 'forward' : null });
    for (const targetSchema of savepointSummaries) {
        const scope = { dbName: !targetSchema.rollback_date && targetSchema.$name || targetSchema.name };
        
        console.log(`\nRolling ${ command === 'rollforward' ? 'forward' : 'back' } database: ${ scope.dbName }`);
        scope.isDrop = (!targetSchema.rollback_date && !targetSchema.status) || (targetSchema.rollback_date && targetSchema.status === 'DOWN');
        if (flags.preview !== false) {
            console.log(`\nThe following structure will now be ${ scope.isDrop ? 'dropped' : 'restored' }:\n`);
            console.table(targetSchema);
        }
        const proceed = flags.force || (await enquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed?'
        })).proceed;
        if (proceed) {
            const savepoint = await driver.database(scope.dbName).savepoint({ direction: command === 'rollforward' ? 'forward' : null });
            scope.returnValue = await savepoint?.rollback();
            if (!scope.isDrop) scope.postName = targetSchema.rollback_date && targetSchema.$name || scope.dbName;
        }
        if (scope.postName) {
            const newSchema = await driver.describeDatabase(scope.postName, '*');
            const $newSchema = CreateDatabase.fromJson(driver, newSchema).status('UP', 'UP').toJson();
            const existing = newDbSchemas.findIndex(sch => sch.name === scope.dbName);
            if (existing > -1) newDbSchemas[existing] = $newSchema;
            else newDbSchemas.push($newSchema);
        }
    }
}

// Updating schema
fs.writeFileSync(schemaFile, JSON.stringify(newDbSchemas, null, 3));
console.log(`\nDone.`);
console.log(`\nLocal schema updated: ${ driverFile }`);

process.exit();