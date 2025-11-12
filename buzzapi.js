// const fs = require('fs');
// const path = require('path');
// const express = require('express');
// const bodyParser = require('body-parser');
// const Database = require('./Database');
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';
// import express from 'express';
// import bodyParser from 'body-parser';
import db from './Database.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mailapi from './mailapi.js';
import chatapi from './chatapi.js';
import signup from './signup.js';

const express = require("express");
const bodyParser = require('body-parser');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PATH_NAME = 'files/';

app.use(bodyParser.raw({ limit: '50mb', type: '*/*' }));

app.use((req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }

    handleRequest(req, res);
});

async function handleRequest(req, res) {
    let inputBuffer;
    if (req.method === 'GET') {
        const queryData = {
            fileId: req.query.fileId || '',
            username: req.query.username || '',
            sessionid: req.query.sessionid || '',
            action: req.query.action || ''
        };
        inputBuffer = Buffer.from(JSON.stringify(queryData));
    } else {
        inputBuffer = req.body;
    }

    const output = await processInput(inputBuffer);
    if (Buffer.isBuffer(output)) {
        res.send(output);
    } else {
        res.json(output);
    }
}

async function processInput(inputBuffer) {
    let payload = '';
    let chunkData = Buffer.alloc(0);
    let chunkDown = Buffer.alloc(0);
    let logmsg = {};

    try {
        if (Buffer.isBuffer(inputBuffer) && inputBuffer.length >= 4) {
            const headerLength = inputBuffer.readUInt32LE(0);
            if (headerLength > 0 && headerLength < 15 * 1024 * 1024 && 4 + headerLength <= inputBuffer.length) {
                payload = inputBuffer.slice(4, 4 + headerLength).toString('utf8');
                chunkData = inputBuffer.slice(4 + headerLength);
            } else {
                payload = inputBuffer.toString('utf8');
            }
        } else {
            payload = inputBuffer.toString('utf8');
        }

        const data = JSON.parse(payload);
        if (!data) {
            return { status: "failed", code: 0, message: "No data.", details: "Provide valid data." };
        }

        const action = data.action || '';
        // const db = new Database();
        // await db.connect();

        switch (action) {
            // case related to chat
            case 'login':
                logmsg.login = await chatapi.login(data, db);
                                logmsg.get_user_profile = await chatapi. get_user_profile(data, db);
                logmsg.get_chats = await chatapi. get_chats(data, db);
                logmsg.get_active_sessions = await chatapi. get_active_sessions(data, db);
                logmsg.get_online_users = await chatapi. get_online_users(data, db);
                logmsg.get_deliver_messages = await chatapi. get_deliver_messages(data, db);
                logmsg.get_deliver_sessions = await chatapi. get_deliver_sessions(data, db);
                logmsg.get_my_sessions = await chatapi. get_my_sessions(data, db);
                break;
            case 'get_chats':
                logmsg.get_chats = await chatapi. get_chats(data, db);
                break;
            case 'get_users':
                logmsg.get_users = await chatapi. get_users(data, db);
                break;
            case 'create_group':
                logmsg.create_group = await chatapi. create_group(data, db);
                data.roomid = logmsg.create_group.create_group[0]?.RoomId || '';
                logmsg.get_receiver_sessions = await chatapi. get_receiver_sessions(data, db);
                break;
            case 'send_message':
                logmsg.send_message = await chatapi. send_message(data, db);
                logmsg.get_receiver_sessions = await chatapi. get_receiver_sessions(data, db);
                break;
            case 'get_messages':
                logmsg.get_messages = await chatapi. get_messages(data, db);
                logmsg.get_message_files = await chatapi. get_message_files(data, db);
                logmsg.get_receiver_profile = await chatapi. get_receiver_profile(data, db);
                logmsg.get_sender_messages = await chatapi. get_sender_messages(data, db);
                logmsg.get_sender_sessions = await chatapi. get_sender_sessions(data, db);
                break;
            case 'get_groups':
                logmsg.get_groups = await chatapi. get_groups(data, db);
                break;
            case 'get_group_users':
                logmsg.get_group_users = await chatapi. get_group_users(data, db);
                break;
            case 'get_online_users':
                logmsg.get_online_users = await chatapi. get_online_users(data, db);
                break;
            case 'get_my_sessions':
                logmsg.get_my_sessions = await chatapi. get_my_sessions(data, db);
                break;
            case 'get_active_sessions':
                logmsg.get_active_sessions = await chatapi. get_active_sessions(data, db);
                break;
            case 'get_common_groups':
                logmsg.get_common_groups = await chatapi. get_common_groups(data, db);
                break;
            case 'get_user_profile':
                logmsg.get_user_profile = await chatapi. get_user_profile(data, db);
                break;
            case 'get_receiver_profile':
                logmsg.get_receiver_profile = await chatapi. get_receiver_profile(data, db);
                break;
            case 'chunk_upload':
                logmsg.chunk_upload = await chatapi. chunk_upload(data, db, chunkData);
                break;
            case 'disconn':
                logmsg.disconn = await chatapi. disconn(data, db);
                logmsg.get_active_sessions = await chatapi. get_active_sessions(data, db);
                logmsg.get_online_users = await chatapi. get_online_users(data, db);
                logmsg.get_my_sessions = await chatapi. get_my_sessions(data, db);
                break;
            case 'chunk_download':
                const [tempLog, tempChunk] = await chatapi. chunk_download(data, db);
                logmsg.chunk_download = tempLog;
                chunkDown = tempChunk;
                break;
            case 'get_max_chunkindex':
                logmsg.get_max_chunkindex = await chatapi. get_max_chunkindex(data, db);
                break;
            case 'reset_status':
                logmsg.reset_status = await chatapi. reset_status(data, db);
                break;
            case 'chunk_assemble':
                logmsg.chunk_assemble = await chatapi. chunk_assemble(data, db);
                break;
            case 'file_download':
                return await chatapi. file_download(data, db); // Special return for file download
            case 'get_message_files':
                logmsg.get_message_files = await chatapi. get_message_files(data, db);
                break;
            case 'chunk_append':
                logmsg.chunk_append = await chatapi. chunk_append(data, db);
                break;
            case 'sender_sessions':
                logmsg.get_sender_sessions = await chatapi. get_sender_sessions(data, db);
                break;
            case 'sender_messages':
                logmsg.get_sender_messages = await chatapi. get_sender_messages(data, db);
                break;
            case 'terminate_session':
                logmsg.terminate_session = await chatapi. terminate_session(data, db);
                break;
            case 'chatsignup':
                logmsg.chatsignup = await signup.chatsignup(data, db);
                break;
            case 'signuptoken':
                logmsg.signuptoken = await signup.signuptoken(data, db);
                break;
            case 'exchangeauth':
                logmsg.exchangeauth = await signup.exchangeauth(data, db);
                break;

            // case related to mail

            case 'mailsignup':
                logmsg.mailsignup = await mailapi.mailsignup(data);
                break;

            case 'mailserpro':
                logmsg.mailserpro = await mailapi.mailserpro(data);
                break;

            case 'serprotoken':
                logmsg.serprotoken = await mailapi.serprotoken(data);
                break;

            case 'exchangemail':
                logmsg.exchangemail = await mailapi.exchangemail(data);
                break;

            case 'getmsgids':
                logmsg.getmsgids = await mailapi.prefercheck(data);
                break;

            case 'batch_getmsg':
                logmsg.batch_getmsg = await mailapi.prefercheck(data);
                break;

            default:
                logmsg = { status: "failed", code: 0, message: 'Invalid action', data };
                break;
        }

        // await db.closeConnection();

        let output;
        if (chunkDown.length > 0) {
            const headerJson = JSON.stringify(logmsg);
            const headerBuf = Buffer.from(headerJson);
            const lengthBuf = Buffer.alloc(4);
            lengthBuf.writeUInt32LE(headerBuf.length, 0);
            output = Buffer.concat([lengthBuf, headerBuf, chunkDown]);
        } else {
            output = logmsg;
        }
        return output;
    } catch (e) {
        logerror({ status: 'error', code: 0, message: 'Error executing script.', document: { message: e.message, stack: e.stack } }, 'Main try error');
        return { status: 'error', message: e.message, stack: e.stack };
    }
}

// Export the processInput function
export { processInput, logerror };

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

if (process.argv[1] === __filename) {
  // Running as a standalone script (child process)
    let input = '';
    process.stdin.on('data', chunk => {
        input += chunk;
    });
    process.stdin.on('end', async () => {
        try {
            const output = await processInput(Buffer.from(input));
            if (Buffer.isBuffer(output)) {
                process.stdout.write(output); // write raw buffer for chunk downloads
            } else {
                console.log(JSON.stringify(output)); // write JSON string
            }
        } catch (err) {
            console.error(JSON.stringify({ status: "error", message: err.message }));
        }
    });
}
