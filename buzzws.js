import module from 'module';
process.env.NODE_PATH = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\node_modules";
module.Module._initPaths();
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// import bodyParser from 'body-parser';
const bodyParser = require('body-parser');
const express = require("express");
const http = require("http");
const WebSocket = require('ws');
const { spawn } = require('child_process');
const readline = require('readline');

const app = express();

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { join } from "path";

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files (e.g., index.html in current folder)
app.use(express.static(__dirname));

// Force / to return index.html
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// app.use(express.json());

// ✅ Add JSON body parsing
app.use(bodyParser.json());

// ✅ Add API endpoint
app.post("/buzzapi", async (req, res) => {
  try {
    // pass the JSON body directly to processInput
    const result = await processInput(JSON.stringify(req.body));
    res.json(result);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// app.get('/buzzoauth', (req, res) => {
//   const appname = getCurrentUrl(req);
  
//   if (secretPath.web.redirect_uris.includes(appname)) {
//     const REDIRECT_URI = appname; // like define('REDIRECT_URI', $appname)
//     res.json({ status: 'ok', redirect_uri: REDIRECT_URI });
//   } else {
//     res.status(400).json({
//       status: 'error',
//       code: 0,
//       message: 'Invalid redirect uri.',
//       uri: appname
//     });
//   }
// });

// Create an HTTP server
const server = http.createServer(app);

const PORT = process.env.PORT || 5173;
server.listen(PORT, () => {
  console.log(`HTTP + WS server running on http://localhost:${PORT}`);
});

// Attach WebSocket to the same HTTP server
const wss = new WebSocket.Server({ server });

// Store active processes and queue
const activeProcesses = new Map();
const sessionWsMap = new Map(); // Maps sessionid to ws
const requestQueue = [];
let runningProcesses = 0;
let jsonData, batchId, jsonString;
const MAX_CONCURRENT = 10;

// const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', ws => {
  console.log('Client connected');

  ws.on('message', async (message, isBinary) => {
    try {
      if (isBinary) {
        const { header, chunkBuffer } = parseBinaryMessage(message);

        jsonData = header; // Assign to outer scope variable
        jsonString = message;
        console.log("Chunk Buffer Size:", chunkBuffer.length);

        // Handle binary data, e.g., save to file or pass to a child process
        // handleBinaryData(ws, message);

      } else {
        jsonData = JSON.parse(message);
        // Generate a unique batch ID
        batchId = jsonData.batchId || Date.now().toString();
        // Prepare the PHP command
        jsonString = JSON.stringify(jsonData).replace(/'/g, "\\'");
      }
      
      console.log('Received JSON:', jsonData);
      // console.log('Received JSON:', jsonData, 'jsonString:', jsonString);
      if (jsonData.action === 'login' && jsonData.sessionid) {
        sessionWsMap.set(jsonData.sessionid, ws);
        console.log(`Tagged sessionid ${jsonData.sessionid} to ws`);
      } else {
        // console.warn('No sessionid provided in JSON:', jsonData);
      }

      // Create request object
      const request = { ws, jsonData, jsonString, batchId };

      // Check if we can process immediately or need to queue
      if (runningProcesses < MAX_CONCURRENT && runningProcesses >= 0) {
        processRequest(request);
      } else {
        console.log(`Queueing request for batch ${batchId}, current running: ${runningProcesses}`);
        requestQueue.push(request);
      }

    } catch (error) {
      console.error('Error processing message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    const targetSessionIds = [];
    // Remove sessionid mappings for this ws
    for (const [sessionId, clientWs] of sessionWsMap.entries()) {
      if (clientWs === ws) {
        targetSessionIds.push(sessionId);
        sessionWsMap.delete(sessionId);
        console.log(`Removed sessionid ${sessionId} from sessionWsMap`);
      }
    }
    // Terminate associated processes
    activeProcesses.forEach((processInfo, pid) => {
      if (processInfo.ws === ws) {
        // processInfo.child.kill();
        activeProcesses.delete(pid);
        runningProcesses--;
        console.log(`Terminated process ${pid} due to client disconnection, , running: ${runningProcesses}`);
        // Process next queued request
        // processNextFromQueue();
      }
    });
    // Process logout for each sessionid in targetSessionIds
    if (targetSessionIds.length > 0) {
      // Send logout JSON to PHP for each sessionId
      for (const sessionId of targetSessionIds) {
        const batchId = Date.now().toString();
        const resetJson = {
          action: 'disconn',
          sessionid: sessionId,
          batchId: batchId
        };
        const logoutJson = JSON.stringify(resetJson).replace(/'/g, "\\'");
        const request = { ws, jsonData: resetJson, jsonString: logoutJson, batchId };
        if (runningProcesses < MAX_CONCURRENT && runningProcesses >= 0) {
          console.log(`Processing disconn request for session ${sessionId}, batch ${batchId}`);
          processRequest(request);
        } else {
          console.log(`Queueing disconn request for session ${sessionId}, batch ${batchId}`);
          requestQueue.push(request);
        }
      }
    } else {
      console.log('No sessionid found for disconnected ws');
    }

    // Process next queued request
    processNextFromQueue();
  });
});

// Process a single request
async function processRequest({ ws, jsonData, jsonString, batchId }) {
  try {
    runningProcesses++;
    console.log(`Processing batch ${batchId}, running: ${runningProcesses}`);

    // Prepare the PHP command
    // const jsonString = JSON.stringify(jsonData).replace(/'/g, "\\'");
    // const args = ['/var/www/html/chat/email_sync_batch.php', `--param=${jsonString}`];
    // const args = ['C:\\xampp\\htdocs\\6messenger\\omschat\\chatapi.php'];
    // const args = ['C:\\Users\\supt3\\Desktop\\Deploy\\6messenger\\omschat\\chatapi.php', `--param=${jsonString}`];
    // const args = ['C:\\Users\\supt3\\Desktop\\Deploy\\6messenger\\omschat\\chatapi.php'];
    // const args = ['C:\\xampp\\htdocs\\6messenger\\omschat\\chatapi.php', `--param=${jsonString}`];
    // Spawn the PHP process
    // const child = spawn('php', args);
    // const args = ['C:\\xampp\\htdocs\\6messenger\\buzzchat\\buzzapi.js'];
    // console.log('Running command:', args);
    // const child = spawn('node', args);
    // Write jsonData as STDIN
    // child.stdin.write(jsonString);
    // child.stdin.end();

    // Capture PID
    // const pid = child.pid;
    // console.log(`Started process for batch ${batchId} with PID: ${pid}`);

    // Store process info
    // activeProcesses.set(pid, { ws, jsonData, batchId, child });

    // Capture output
    let sendResult;
    // Generate a fake PID for tracking
    const pid = Date.now() + Math.random();

    console.log(`Started process for batch ${batchId} with PID: ${pid}`);

    // Store process info (no child)
    activeProcesses.set(pid, { ws, jsonData, batchId });

    // Call processInput directly
    const result = await processInput(jsonString);

    // Simulate phpOutput as Buffer
    let phpOutput;
    if (Buffer.isBuffer(result)) {
      phpOutput = result;
    } else {
      phpOutput = Buffer.from(JSON.stringify(result));
    }
    // let phpOutput = Buffer.alloc(0);
    // child.stdout.on('data', (data) => {
      // phpOutput += data.toString();
      // phpOutput = Buffer.concat([phpOutput, data]);
      // phpOutput += data;
    // });
    // child.stderr.on('data', (data) => {
      // phpOutput += data.toString();
      // phpOutput = Buffer.concat([phpOutput, data]);
      // phpOutput += data;
    // });
    // console.log('Received JSON:', jsonData);
    // Handle process exit
    // child.on('close', async (code) => {
      let jsonphp = {};
      try {
        if (phpOutput.length >= 4) {
          const headerLength = phpOutput.readUInt32LE(0);
  
          if (headerLength > 0 && headerLength < 65536 && headerLength + 4 <= phpOutput.length) {
            const headerJson = phpOutput.slice(4, 4 + headerLength).toString('utf-8');
            const chunkBuffer = phpOutput.slice(4 + headerLength);
            // console.error('Raw Output:', phpOutput);
            jsonphp = JSON.parse(headerJson);
            console.log('Chunk size:', chunkBuffer.length);
          } else {
            console.error('Raw Output:', phpOutput.toString());
            const cleanedOutput = phpOutput.toString().trim();
            // .replace(/^"|"$/g, '').replace(/\\"/g, '"')
            jsonphp = JSON.parse(cleanedOutput);
          }
        } else {
          // console.error('Raw Output:', phpOutput.toString());
          const cleanedOutput = phpOutput.toString().trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')
          jsonphp = JSON.parse(cleanedOutput);
        }
      } catch (e) {
        console.error(`Error parsing JSON from PHP output:`, e);
        // console.error('Raw Output:', phpOutput);  // Helps debugging
      }
      console.log(`Process for batch ${batchId} with PID ${pid} finished with output:`, jsonphp);

      const response = {
        status: 'completed',
        pid: pid,
        batchId: batchId,
        originalData: jsonData,
        // originalData: { requestId: jsonData.requestId },
        // phpOutput: phpOutput.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'),
        phpOutput: jsonphp,
      };
      
      // Send response to client
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (jsonData.action === 'chunk_download') {
          ws.send(phpOutput);
        } else {
          sendResult = await handleSendMessage(response, ws);
          ws.send(JSON.stringify(sendResult));
        }
        console.log(`WebSocket sent for batch ${batchId}, PID ${pid}, sendResult ${sendResult.message}, response ${response}`);
      } else {
        if (jsonData.action === 'disconn') {
          sendResult = await handleSendMessage(response, ws);
          // console.log("Disconn sendResult:", sendResult);
        }
        console.warn(`WebSocket closed for batch ${batchId}, PID ${pid}, response ${response}`);
      }

      // Clean up
      activeProcesses.delete(pid);
      runningProcesses--;
      console.log(`Process ${pid} ended, running: ${runningProcesses}, inQueue: ${requestQueue.length}`);

      // Process next queued request
      processNextFromQueue();
    // });

  } catch (error) {
    console.error(`Error processing batch ${batchId}:`, error);
    runningProcesses--;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        error: 'Command execution failed',
        batchId,
        originalData: jsonData
      }));
    }
    processNextFromQueue();
  }
}

// Process the next request from the queue
function processNextFromQueue() {
  if (requestQueue.length > 0 && runningProcesses < MAX_CONCURRENT) {
    const nextRequest = requestQueue.shift();
    console.log(`Processing queued batch ${nextRequest.batchId}, queue length: ${requestQueue.length}`);
    processRequest(nextRequest);
  }
}

function parseBinaryMessage(binaryBuffer) {
  if (binaryBuffer.length < 4) {
    throw new Error("Buffer too short to contain header length.");
  }

  // 1️⃣ Read the first 4 bytes as header length (Uint32 little endian)
  const headerLength = binaryBuffer.readUInt32LE(0);

  if (binaryBuffer.length < 4 + headerLength) {
    throw new Error("Buffer does not contain full header data.");
  }

  // 2️⃣ Extract and parse the header
  const headerBuffer = binaryBuffer.slice(4, 4 + headerLength);
  const headerJson = headerBuffer.toString('utf-8');
  let header;
  try {
    header = JSON.parse(headerJson);
  } catch (err) {
    throw new Error("Invalid JSON header: " + err.message);
  }

  // 3️⃣ Extract the binary chunk
  const chunkBuffer = binaryBuffer.slice(4 + headerLength);

  return { header, chunkBuffer };
}

// Enable raw mode to capture keypresses only if stdin is a TTY
if (process.stdin.isTTY) {
// Enable raw mode to capture keypresses
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
  if (key.name === 's') {
    console.log('Stopping server…');
    
    wss.close(() => {
      console.log('WebSocket server closed');

      // Now kill all active child processes
      activeProcesses.forEach(({ child, batchId }, pid) => {
        console.log(`Terminating process PID ${pid}, batch ${batchId}`);
        child.kill();
      });
      activeProcesses.clear();
    });

      triggerResetStatus().then(() => {
        console.log('Reset status completed. Exiting now.');
        process.exit(0);
      });

  }
  if (key.name === 'c') {
    console.clear(); // Clear the console
    console.log('Console cleared via keypress');
  }
  if (key.ctrl && key.name === 'c') {
    process.exit(); // Allow Ctrl+C to exit the server
  }
});
}

async function triggerResetStatus() {
  const batchId = Date.now().toString();
  const resetJson = { action: 'reset_status', batchId };
  const jsonString = JSON.stringify(resetJson);

    console.log('Starting reset_status command…');
    // const args = ['C:\\xampp\\htdocs\\6messenger\\omschat\\chatapi.php'];
    // const args = ['C:\\xampp\\htdocs\\6messenger\\buzzchat\\buzzapi.js'];
    // const child = spawn('node', args);
    // const args = ['C:\\Users\\supt3\\Desktop\\Deploy\\6messenger\\omschat\\chatapi.php'];
    // const child = spawn('php', args);
    // child.stdin.write(jsonString);
    // child.stdin.end();
    // Capture PID
    // const pid = child.pid;
    // console.log(`Started process for batch ${batchId} with PID: ${pid}`);
    const result = await processInput(jsonString);
    // // Store process info
    // activeProcesses.set(pid, { ws: null, jsonString, batchId, child });
    // let output = '';
    // child.stdout.on('data', (data) => {
      // console.log('Reset status output:', data.toString());
      // output += data.toString();
    // });

    // child.stderr.on('data', (data) => {
      // console.error('Reset status error:', data.toString());
//       output += data.toString();
//     });

//     child.on('close', (code) => {
      console.log(`Reset status process exited with output:\n${result}`);
//       resolve();
//     });
//     console.log('Ending reset_status command…');
  // });
}

console.log('WebSocket server running on ws://localhost:5173');

triggerResetStatus().then(() => {
  console.log('Reset status completed.');
});

import { processInput } from './buzzapi.js';
import { handleSendMessage } from './main.js';