import module from 'module';
process.env.NODE_PATH = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\node_modules";
module.Module._initPaths();
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';
// import mysql from 'mysql2/promise';
// import toUnnamed from 'named-placeholders';
// import namedPlaceholders from "named-placeholders";
// import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
// dotenv.config({ path: require('path').resolve(__dirname, '.env') });
dotenv.config({ quiet: true });
// const np = toUnnamed();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Database {
    constructor() {
        this.pool = null;
        this.host = process.env.DB_HOST;
        this.port = process.env.DB_PORT;
        this.database = process.env.DB_NAME;
        this.username = process.env.DB_USER;
        this.password = process.env.DB_PASS;
    }

    async connect() {
        try {
            this.pool = await mysql.createPool({
                host: this.host,
                port: this.port,
                database: this.database,
                user: this.username,
                password: this.password,
                multipleStatements: true,
                // rowsAsArray: true
                // namedPlaceholders: true
            });
        } catch (error) {
            throw new Error(`Connection failed: ${error.message}`);
        }
    }

    async getConnection() {
        return this.pool;
    }

    async closeConnection() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }

    async execQuery(query, params = {}) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            // Split into individual statements
            // const statements = query.split(';').filter(s => s.trim());
            // let finalSql = '';
            // let finalValues = [];

            // for (const stmt of statements) {
            //     const [sql, vals] = np(stmt, params);
            //     finalSql += sql + ';';
            //     finalValues = finalValues.concat(vals);
            // }
            // const [rows, fields] = await connection.query(finalSql, finalValues);

            // const toNamed = namedPlaceholders();
            // const [sql, value] = toNamed(query, params);

            // const np = toUnnamed();
            // const [sql, values] = np(query, params);

            const [rows, fields] = await connection.query(query, params);
            // logerror(rows, 'execQuery');
            // console.log(rows);
            // Handle multiple result sets
            // const result = Array.isArray(rows) ? [rows] : rows;
            // const result = Array.isArray(rows) ? rows : [rows];
            // Handle multiple result sets
            // Handle multiple result sets
            // let result = [];
            // if (Array.isArray(rows)) {
            //     if (Array.isArray(rows[0])) {
            //         // multiple rowsets
            //         result = rows; // keep as array of arrays of objects
            //     } else {
            //         // single rowset
            //         result = [rows]; // wrap to keep consistent structure
            //     }
            // }

            // Get warnings
            const [warnings] = await connection.query('SHOW WARNINGS');

            const response = {
                affected_rows: rows.affectedRows ?? 0,
                affected_columns: fields?.length ?? 0,
                lastInsertId: rows.insertId ?? 0,
                warnings_count: warnings.length,
                warnings_desc: warnings,
                final_query: query
            };

            return {
                status: 'success',
                code: 1,
                message: 'Query executed successfully.',
                // document: response,
                result: rows
            };
        } catch (error) {
            const logmsg = {
                status: 'error',
                code: 0,
                message: 'Error executing query.',
                document: {
                    message: error.message,
                    code: error.code,
                    file: error.fileName,
                    line: error.lineNumber,
                    final_query: query
                }
            };
            throw new Error(JSON.stringify(logmsg));
        } finally {
            if (connection) connection.release();
        }
    }

    async execSql(query, params = {}) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [rows, fields] = await connection.execute({ sql: query, rowsAsArray: true }, params);

            // Handle multiple result sets, fetch as arrays (numeric indices)
            // const resultSets = Array.isArray(results) ? [results] : results;

            // Get warnings
            const [warnings] = await connection.query('SHOW WARNINGS');

            const response = {
                affected_rows: rows.affectedRows || 0,
                affected_columns: fields ? fields.length : 0,
                lastInsertId: rows.insertId || 0,
                warnings_count: warnings.length,
                warnings_desc: warnings,
                final_query: query
            };

            return {
                status: 'success',
                code: 1,
                message: 'Query executed successfully.',
                // document: response,
                result: rows
            };
        } catch (error) {
            const logmsg = {
                status: 'error',
                code: 0,
                message: 'Error executing query.',
                document: {
                    message: error.message,
                    code: error.code,
                    file: error.fileName,
                    line: error.lineNumber,
                    final_query: query
                }
            };
            throw new Error(JSON.stringify(logmsg));
        } finally {
            if (connection) connection.release();
        }
    }

    async insertChunk(query, params = {}) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [results, fields] = await connection.execute(query, params);

            // Handle multiple result sets
            const resultSets = Array.isArray(results) ? [results] : results;

            // Get warnings
            const [warnings] = await connection.query('SHOW WARNINGS');

            const response = {
                affected_rows: results.affectedRows || 0,
                affected_columns: fields ? fields.length : 0,
                lastInsertId: results.insertId || 0,
                warnings_count: warnings.length,
                warnings_desc: warnings,
                final_query: query
            };

            return {
                status: 'success',
                code: 1,
                message: 'Chunk inserted successfully.',
                document: response,
                result: resultSets
            };
        } catch (error) {
            const logmsg = {
                status: 'error',
                code: 0,
                message: 'Error executing chunk.',
                document: {
                    message: error.message,
                    code: error.code,
                    file: error.fileName,
                    line: error.lineNumber,
                    final_query: query
                }
            };
            throw new Error(JSON.stringify(logmsg));
        } finally {
            if (connection) connection.release();
        }
    }

    async selectChunk(query, params = {}) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [results, fields] = await connection.execute(query, params);

            // Handle chunk data (assuming ChunkData is a BLOB column)
            let chunkContent = null;
            if (results.length > 0 && results[0].ChunkData) {
                chunkContent = results[0].ChunkData;
                if (Buffer.isBuffer(chunkContent)) {
                    chunkContent = chunkContent.toString('utf8');
                }
            }

            // Get warnings
            const [warnings] = await connection.query('SHOW WARNINGS');

            const response = {
                affected_rows: results.affectedRows || results.length,
                affected_columns: fields ? fields.length : 0,
                lastInsertId: results.insertId || 0,
                warnings_count: warnings.length,
                warnings_desc: warnings,
                final_query: query
            };

            return {
                status: 'success',
                code: 1,
                message: 'Chunk selected successfully.',
                document: response,
                chunk_data: chunkContent
            };
        } catch (error) {
            const logmsg = {
                status: 'error',
                code: 0,
                message: 'Error executing chunk.',
                document: {
                    message: error.message,
                    code: error.code,
                    file: error.fileName,
                    line: error.lineNumber,
                    final_query: query
                }
            };
            throw new Error(JSON.stringify(logmsg));
        } finally {
            if (connection) connection.release();
        }
    }
}

function logerror(logmsg, cstmsg) {
    let errmsg = `[ ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} ] [ ${cstmsg} ]`;
    function processArray(obj) {
        let result = '';
        for (let [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                result += ` [ ${key} : {${processArray(value)}} ]`;
            } else {
                result += ` [ ${key} : ${value} ]`;
            }
        }
        return result;
    }
    errmsg += processArray(logmsg) + '\n';
    const logFile = path.join(__dirname, 'chatlog.log');
    if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '');
    }
    fs.appendFileSync(logFile, errmsg);
}

// ❌ remove this line
// module.exports = Database;

// ✅ add this instead
// export default Database;
// export { Database };

const db = new Database();
await db.connect(); // connect once at startup

export default db;