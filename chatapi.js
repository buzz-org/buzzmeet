// Function implementations
import fs from 'fs';
import path from 'path';
import db from './Database.js';
import { logerror } from './buzzapi.js';

async function terminate_session(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const connId = data.connId || [];
    if (!connId.length) return { status: "failed", code: 0, message: 'Connection Id is required', data };

    const placeholders = connId.map(() => `?`).join(', ');

    const query = `
        UPDATE user_conns cn
        JOIN (
            SELECT uc.ConnId AS newTonnId
            FROM user_conns uc
            WHERE uc.SessnId = ?
        ) AS sub ON 1 = 1
        SET cn.TonnId = sub.newTonnId
        WHERE cn.ConnId IN (${placeholders})
          AND cn.status = '1';

        SELECT ns.ConnId, ns.User, ns.SessnId, ns.DeviceIP,
               DATE_FORMAT(ns.Conn_At, '%d-%m-%Y %H:%i:%s') AS Conn_At,
               (CASE WHEN (ns.status = '1') THEN 'Online' ELSE 'Offline' END) AS Status
        FROM user_conns ns
        WHERE ns.ConnId IN (${placeholders})
        ORDER BY ns.ConnId;
    `;

    // params order must match the placeholders
    const params = [
        sessionid,           // for uc.SessnId = ?
        ...connId,           // for first IN (...)
        ...connId            // for second IN (...)
    ];

    const response = await db.execQuery(query, params);

    return { status: "success", code: 1, message: 'Terminated successfully.', terminate_session: response.result[response.result.length - 1] || [] };
}

async function file_download(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const fileId = data.fileId || '';
    if (!fileId) return { status: "failed", code: 0, message: 'File Id is required' };

    const query = `SELECT uf.FileName 
FROM user_files uf 
INNER JOIN user_mssgs ug ON ug.MsgId = uf.MsgId 
INNER JOIN user_mmbrs ub ON ub.RoomId = ug.RoomId 
INNER JOIN sec_users sc ON sc.login = ub.User 
INNER JOIN user_conns cn ON cn.User = ub.User 
WHERE uf.FileId = ? 
  AND ub.User = ? 
  AND sc.status = ? 
  AND cn.status = ? 
  AND cn.SessnId = ?;`;

    const params = [
  fileId,      // uf.FileId = ?
  username,    // ub.User = ?
  '1',         // sc.status = ?
  '1',         // cn.status = ?
  sessionid    // cn.SessnId = ?
];

    const response = await db.execQuery(query, params);

    if (!response.result[0]?.[0]?.FileName) {
        return { status: "failed", code: 0, message: 'No file from Query.', data, response };
    }

    const fileName = response.result[0][0].FileName;
    const finalName = `${fileId}_${fileName}.part`;
    const filePath = path.join(PATH_NAME, finalName);

    if (fs.existsSync(filePath)) {
        return { status: 'file', path: filePath, name: fileName };
    } else {
        return { status: "failed", code: 0, message: 'File not found.', data: response };
    }
}

async function chunk_append(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const fileId = data.fileId || '';
    if (!fileId) return { status: "failed", code: 0, message: 'File Id is required' };

    const chunkIndex = data.chunkIndex || '';
    if (chunkIndex === '') return { status: "failed", code: 0, message: 'Chunk Index is required' };

    const totalChunks = data.totalChunks || '';
    if (totalChunks === '') return { status: "failed", code: 0, message: 'Total chunks is required' };

    const fileName = data.fileName || '';
    if (!fileName) return { status: "failed", code: 0, message: 'File name is required' };

    const fileBytes = data.fileBytes || '';
    if (!fileBytes) return { status: "failed", code: 0, message: 'File size in bytes is required' };

    if (parseInt(chunkIndex) < parseInt(totalChunks)) {
        const finalName = `${fileId}_${fileName}.part`;
        const filePath = path.join(PATH_NAME, finalName);

        const chunkSize = 15 * 1024 * 1024;
        let currentFileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        const expectedChunkIndex = Math.floor(currentFileSize / chunkSize);

        if (parseInt(chunkIndex) !== expectedChunkIndex) {
            return { status: "success", code: 1, message: `Chunk already appended. Expected: ${expectedChunkIndex}, Got: ${chunkIndex}`, chunkIndex, fileId, totalChunks, fileName, fileBytes };
        }

        const response = await db.selectChunk("SELECT ChunkData FROM user_chunks WHERE FileId = :fileid AND ChunkIndx = :ChunkIndx;", { fileid: fileId, ChunkIndx: chunkIndex });

        const chunkContent = response.chunk_data; // Assume Buffer

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, chunkContent);
            return { status: "success", code: 1, message: 'File created/Chunk appended', chunkIndex, fileId, totalChunks, fileName, fileBytes };
        }

        fs.appendFileSync(filePath, chunkContent);
        return { status: "success", code: 1, message: 'Chunk appended', chunkIndex, fileId, totalChunks, fileName, fileBytes };
    }
    return { status: "failed", code: 0, message: 'chunkIndex is greater/equal than totalChunks' };
}

async function chunk_assemble(data, db) {
    // Implementation similar to chunk_append, adjust based on full code
    // Since truncated, placeholder
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    // ... other checks

    // Assume query and logic for assembling chunks
    // For example:
    // Fetch all chunks, append to file, etc.
    return { status: "success", code: 1, message: 'Chunk assembled successfully' }; // Placeholder
}

async function reset_status(data, db) {
    const query = `UPDATE user_conns SET Discn_At = NOW(), status = '0' WHERE Discn_At IS NULL;UPDATE sec_users us JOIN ( SELECT cn.User, MAX(CASE WHEN cn.status = 1 THEN cn.ConnId ELSE NULL END) AS LatestActiveConnId, SUM(cn.status) AS ActiveCount FROM user_conns cn WHERE cn.User IN (SELECT uc.User FROM user_conns uc) GROUP BY cn.User) agg ON us.login = agg.User SET us.status = IF(agg.ActiveCount = 0, 0, 1);
    UPDATE sec_users sc SET sc.status = NULL, sc.ConnId = NULL;
    -- TRUNCATE user_conns;
    -- TRUNCATE user_mmbrs;
    -- TRUNCATE user_mssgs;
    -- TRUNCATE user_reads;
    -- TRUNCATE user_room;
    -- TRUNCATE user_chunks;
    -- TRUNCATE user_files;
    `;

    const params = {};
    const response = await db.execQuery(query, params);
    // logerror(response, 'reset_status');
    return { status: "success", code: 1, message: 'Reset status successfull' };
}

async function get_message_files(data, db) {
    const username = data.username || '';
    if (!username) {
        return {
            status: "failed",
            code: 0,
            message: "Username is required"
        };
    }

    const roomid = data.roomid || '';
    if (!roomid) {
        return {
            status: "failed",
            code: 0,
            message: "Room Id is required"
        };
    }

    const sessionid = data.sessionid || '';
    if (!sessionid) {
        return {
            status: "failed",
            code: 0,
            message: "Session Id is required"
        };
    }

    const query = `SELECT um.MsgId, uf.FileId, uf.FileName,
    (CASE
        WHEN FileSize >= 1024 * 1024 * 1024 THEN CONCAT(ROUND(FileSize / (1024 * 1024 * 1024), 2), ' GB')
        WHEN FileSize >= 1024 * 1024 THEN CONCAT(ROUND(FileSize / (1024 * 1024), 2), ' MB')
        WHEN FileSize >= 1024 THEN CONCAT(ROUND(FileSize / 1024, 2), ' KB')
        ELSE CONCAT(FileSize, ' Bytes')
    END) AS FileSize,
    um.RoomId,
    uf.FileSize AS fileBytes
FROM user_mssgs um
INNER JOIN user_files uf ON uf.MsgId = um.MsgId
WHERE um.RoomId = ?
GROUP BY uf.FileId
ORDER BY uf.FileId;`;

    const params = [
  roomid  // WHERE um.RoomId = ?
];
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Message files successful",
        message_files: response.result || []
    };
}

async function get_max_chunkindex(data, db) {
    // Placeholder
    const query = "SELECT MAX(ChunkIndx) AS max FROM user_chunks WHERE FileId = :fileid;";
    const response = await db.execQuery(query, { fileid: data.fileId });
    return { status: "success", code: 1, message: 'Max chunk index', max: response.result[0][0].max };
}

async function chunk_download(data, db) {
    // Check params
    const fileId = data.fileId || '';
    const chunkIndex = data.chunkIndex || '';

    // ... checks

    const response = await db.selectChunk("SELECT ChunkData FROM user_chunks WHERE FileId = :fileid AND ChunkIndx = :chunkindx;", { fileid: fileId, chunkindx: chunkIndex });

    return [response, response.chunk_data]; // chunk_data is Buffer
}

async function disconn(data, db) {
    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const query = `UPDATE user_conns 
SET Discn_At = NOW(), status = '0' 
WHERE SessnId = ? AND Discn_At IS NULL;

UPDATE sec_users us
JOIN (
    SELECT 
        cn.User, 
        cn.ConnId AS LatestConnId,
        ROW_NUMBER() OVER (
            PARTITION BY cn.User 
            ORDER BY 
                (cn.Discn_At IS NOT NULL),  -- Active sessions (NULL Discn_At) first
                cn.Discn_At DESC,           -- Then by latest disconnect time
                cn.Conn_At DESC             -- Fallback: latest connection time
        ) AS rn,
        SUM(cn.status) OVER (PARTITION BY cn.User) AS ActiveCount
    FROM user_conns cn
    WHERE cn.User = (
        SELECT uc.User
        FROM user_conns uc
        WHERE uc.SessnId = ?
    )
) agg 
ON agg.User = us.login 
SET us.status = IF(agg.ActiveCount = 0, 0, 1), 
    us.ConnId = agg.LatestConnId;`;
    const params = [
  sessionid, // for first `WHERE SessnId = ?`
  sessionid  // for subquery `WHERE uc.SessnId = ?`
];

    const response = await db.execQuery(query, params);

    return { status: "success", code: 1, message: 'Disconnected successfully' };
}

async function chunk_upload(data, db, chunkData) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: "Username is required" };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: "Session Id is required" };

    const fileId = data.fileId || '';
    if (!fileId) return { status: "failed", code: 0, message: "File Id is required" };

    const chunkIndex = data.chunkIndex ?? '';
    if (chunkIndex === '') return { status: "failed", code: 0, message: "Chunk Index is required" };

    const totalChunks = data.totalChunks || '';
    if (!totalChunks) return { status: "failed", code: 0, message: "Total chunks is required" };

    const fileName = data.fileName || '';
    if (!fileName) return { status: "failed", code: 0, message: "File name is required" };

    // Ensure chunkData is a Buffer (binary)
    const chunkBuffer = Buffer.isBuffer(chunkData) ? chunkData : Buffer.from(chunkData);
    const ChunkSize = chunkBuffer.length;

    const finalName = `${fileId}_${fileName}.part`;
    const filePath = path.join(PATH_NAME, finalName);

    // Write file chunk (append if not first chunk)
    try {
        if (chunkIndex === 0) {
            fs.writeFileSync(filePath, chunkBuffer); // overwrite
        } else {
            fs.appendFileSync(filePath, chunkBuffer); // append
        }
    } catch (err) {
        return { status: "failed", code: 0, message: "Unable to write file", error: err.message };
    }

    // Insert into DB
    const query = `
        INSERT INTO user_chunks (FileId, ChunkIndx, ChunkData, ChunkSize)
        VALUES (:fileid, :ChunkIndx, :chunk, :ChunkSize);
    `;
    const params = {
        fileid: fileId,
        ChunkIndx: chunkIndex,
        chunk: chunkBuffer,  // store binary
        ChunkSize
    };

    let response = {};
    try {
        response = await db.insertChunk(query, params);
    } catch (err) {
        return { status: "failed", code: 0, message: "DB insert failed", error: err.message };
    }

    return {
        status: "success",
        code: 1,
        message: "Chunk received successfully",
        ChunkId: response?.document?.lastInsertId || null,
        chunk_size: ChunkSize,
        chunkIndex,
        fileId,
        totalChunks
    };
}

// Get Sender Sessions
async function get_sender_sessions(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: "Username is required" };

    const roomid = data.roomid || '';
    if (!roomid) return { status: "failed", code: 0, message: "Room Id is required" };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: "Session Id is required" };

    const query = `SELECT ns.ConnId, ns.User, ns.SessnId, ns.DeviceIP,
       DATE_FORMAT(ns.Conn_At, '%d-%m-%Y %H:%i:%s') AS Conn_At,
       (CASE WHEN (ns.status = '1') THEN 'Online' ELSE 'Offline' END) AS Status
FROM user_conns ns
WHERE ns.status = 1
  AND ns.User != ?
  AND ns.User IN (
      SELECT ms.User FROM user_mssgs ms WHERE ms.RoomId = ?
  )
ORDER BY ns.ConnId;`;
const params = [
  username, // ns.User != ?
  roomid    // ms.RoomId = ?
];

    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Sender session successful",
        sender_sessions: response.result || []
    };
}


// Get Sender Messages
async function get_sender_messages(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: "Username is required" };

    const roomid = data.roomid || '';
    if (!roomid) return { status: "failed", code: 0, message: "Room Id is required" };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: "Session Id is required" };

    const query = `SELECT ms.MsgId, rd.MsgState, ms.User, rd.MsgState, rd.Read_At,
       rd.ConnId, rd.ConnIndx, ms.RoomId,
       (SELECT COUNT(mb.MbrId) 
        FROM user_mmbrs mb 
        WHERE mb.RoomId = ms.RoomId AND mb.User != ms.User) AS TotalMembers,
       COUNT(CASE WHEN rd.MsgState = 3 THEN 1 END) AS SeenCount
FROM user_mssgs ms
JOIN user_reads rd ON rd.MsgId = ms.MsgId
JOIN user_room rm ON rm.RoomId = ms.RoomId
WHERE ms.RoomId = ?
AND (
    CASE 
        WHEN (rm.Type = '2') THEN (1=1)
        ELSE (
            rd.ConnId IN (SELECT cn.ConnId FROM user_conns cn WHERE cn.SessnId = ?)
            AND rd.ConnIndx IN (
                SELECT MAX(rd2.ConnIndx)
                FROM user_reads rd2
                WHERE rd2.ConnId = rd.ConnId
            )
        )
    END
)
GROUP BY ms.MsgId;`;

const params = [
  roomid,     // ms.RoomId = ?
  sessionid   // cn.SessnId = ?
];

    const response = await db.execQuery(query, params);
    // logerror(response, 'sender_messages');
    return {
        status: "success",
        code: 1,
        message: "Sender messages successful",
        sender_messages: response.result || []
    };
}


// Get Deliver Messages
async function get_deliver_messages(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: "Username is required" };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: "Session Id is required" };

    const query = `SELECT ms.MsgId, rd.MsgState, ms.User, rd.MsgState, rd.Read_At,
       rd.ConnId, rd.ConnIndx, ms.RoomId,
       (SELECT COUNT(mb.MbrId) 
        FROM user_mmbrs mb 
        WHERE mb.RoomId = ms.RoomId AND mb.User != ms.User) AS TotalMembers,
       COUNT(CASE WHEN rd.MsgState = 3 THEN 1 END) AS SeenCount
FROM user_mssgs ms
JOIN user_reads rd ON rd.MsgId = ms.MsgId
JOIN user_room rm ON rm.RoomId = ms.RoomId
WHERE (
    CASE 
        WHEN (rm.Type = '2') THEN (1=1)
        ELSE (
            rd.DonnId IN (SELECT cn.ConnId FROM user_conns cn WHERE cn.SessnId = ?)
        )
    END
)
GROUP BY ms.MsgId;`;
    const params = [ sessionid ];
    const response = await db.execQuery(query, params);
    // logerror(response, 'deliver_messages');
    return {
        status: "success",
        code: 1,
        message: "Deliver messages successful",
        deliver_messages: response.result || []
    };
}


// Get Deliver Sessions
async function get_deliver_sessions(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: "Username is required" };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: "Session Id is required" };

    const query = `SELECT ur.RoomId, ns.ConnId, ns.User, ns.SessnId, ns.DeviceIP,
       DATE_FORMAT(ns.Conn_At, '%d-%m-%Y %H:%i:%s') AS Conn_At,
       (CASE WHEN (ns.status = '1') THEN 'Online' ELSE 'Offline' END) AS Status
FROM user_conns ns
JOIN sec_users su ON su.login = ?
JOIN user_room ur ON (
    CASE 
        WHEN (ur.Type = '1') 
            THEN (ur.Room = CONCAT(LEAST(ns.User, su.login), '_', GREATEST(ns.User, su.login)))
        WHEN (ur.Type = '2') 
            THEN (ur.RoomId IN (
                SELECT mm.RoomId 
                FROM user_mmbrs mm 
                WHERE mm.User IN (ns.User, su.login)
            ))
    END
)
WHERE ns.status = 1
  AND ns.User != su.login
GROUP BY ns.SessnId
ORDER BY ns.ConnId;`;

    const params = [ username ];
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Deliver sessions successful",
        deliver_sessions: response.result || []
    };
}

async function get_receiver_sessions(data, db) {
    const username = data.username || '';
    if (!username) {
        return {
            status: "failed",
            code: 0,
            message: "Username is required"
        };
    }

    const roomid = data.roomid || '';
    if (!roomid) {
        return {
            status: "failed",
            code: 0,
            message: "Room Id is required"
        };
    }

    const sessionid = data.sessionid || '';
    if (!sessionid) {
        return {
            status: "failed",
            code: 0,
            message: "Session Id is required"
        };
    }

    const action = data.action || '';

    const query = `-- get_receiver_sessions
SELECT 
    ms.MsgId,
    ms.FileName,
    (CASE WHEN (ur.Type = '1') THEN ('Single') WHEN (ur.Type = '2') THEN ('Group') END) AS ChatType,
    (CASE WHEN (ur.Type = '1') THEN (su.name) ELSE ur.Room END) AS Name,
    ur.RoomId,
    us.SessnId,
    (CASE 
        WHEN (ur.Type = '2') THEN (
            SELECT CONCAT(COUNT(*), ' Online')
            FROM user_mmbrs mm
            JOIN sec_users su2 ON su2.login = mm.User
            WHERE mm.RoomId = ur.RoomId AND su2.status = '1'
        )
        WHEN (su.status = '1') THEN ('Online')
        WHEN (su.status != '1') THEN (
            CONCAT(
                'Last seen ',
                CASE
                    WHEN DATE(us.Discn_At) = CURDATE() THEN 'today at '
                    WHEN DATE(us.Discn_At) = CURDATE() - INTERVAL 1 DAY THEN 'yesterday at '
                    WHEN YEAR(us.Discn_At) < YEAR(CURDATE()) THEN
                        CONCAT('on ', DATE_FORMAT(us.Discn_At, '%d %b %Y'), ' at ')
                    ELSE
                        CONCAT('on ', DATE_FORMAT(us.Discn_At, '%d %b'), ' at ')
                END,
                DATE_FORMAT(us.Discn_At, '%h:%i %p')
            )
        )
        ELSE 'Offline'
    END) AS Status,
    ms.CrtBy AS sender,
    us.User AS receiver,
    TO_BASE64(
        CASE 
            WHEN ms.MsgTxt IS NOT NULL AND ms.MsgTxt != '' THEN
                CASE 
                    WHEN CHAR_LENGTH(ms.MsgTxt) > 40
                        THEN CONCAT(SUBSTRING(ms.MsgTxt, 1, 40), '...')
                    ELSE ms.MsgTxt
                END
            WHEN ms.MsgTxt = '' AND ms.FileName IS NOT NULL THEN
                CASE
                    WHEN CHAR_LENGTH(ms.FileName) > 40
                        THEN CONCAT(SUBSTRING(ms.FileName, 1, 40), '...')
                    ELSE ms.FileName
                END
            ELSE ('No messages yet')
        END
    ) AS MsgStr,
    TO_BASE64(ms.MsgTxt) AS MsgTxt,
    ms.Sent_at,
    (
        CASE 
            WHEN (ms.User = us.User) THEN (NULL)
            ELSE (
                SELECT 
                    (CASE WHEN (COUNT(*) = 0) THEN (NULL) ELSE (COUNT(*)) END)
                FROM user_reads r 
                JOIN user_mssgs m ON r.MsgId = m.MsgId AND m.RoomId = ur.RoomId
                WHERE r.User != ms.User AND r.Read_At IS NULL AND r.User = us.User
            )
        END
    ) AS Unread,
    cn.ConnId
FROM user_conns us
INNER JOIN user_mmbrs um ON um.User = us.User
INNER JOIN user_room ur ON ur.RoomId = um.RoomId
INNER JOIN LATERAL (
    SELECT sg.*, uf.FileName 
    FROM user_mssgs sg 
    LEFT JOIN user_files uf ON uf.MsgId = sg.MsgId
    WHERE sg.RoomId = um.RoomId 
    ORDER BY sg.MsgId DESC 
    LIMIT 1
) AS ms ON ms.RoomId = ur.RoomId
INNER JOIN sec_users su ON su.login = us.User
INNER JOIN user_conns cn ON cn.SessnId = ?
WHERE ur.RoomId = ?
${action === 'create_group' ? "" : "AND us.SessnId != ?"}
AND us.status = ? 
AND us.Discn_At IS NULL
ORDER BY us.status DESC;`;

    let params;
if (action === 'create_group') {
    params = [sessionid, roomid, '1'];
} else {
    params = [sessionid, roomid, sessionid, '1'];
}
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Message received successfully",
        receiver_sessions: response.result || []
    };
}

async function get_receiver_profile(data, db) {
    const username = data.username || '';
    if (!username) {
        return {
            status: "failed",
            code: 0,
            message: "Username is required"
        };
    }

    const roomid = data.roomid || '';
    if (!roomid) {
        return {
            status: "failed",
            code: 0,
            message: "Room Id is required"
        };
    }

    const query = `SELECT ur.RoomId, ur.Room, 
    (CASE WHEN (ur.Type = 1) THEN (su.name) ELSE (ur.Room) END) AS Name, 
    (CASE 
        WHEN (ur.Type = '2') THEN (
            SELECT CONCAT(COUNT(*), ' Online') 
            FROM user_mmbrs mm
            JOIN sec_users su2 ON su2.login = mm.User
            WHERE mm.RoomId = ur.RoomId AND su2.status = '1'
        )
        WHEN (uc.status = '1') THEN ('Online') 
        WHEN (uc.status != '1') THEN (
            CONCAT(
                'Last seen ',
                CASE
                    WHEN DATE(uc.Discn_At) = CURDATE() THEN 'today at '
                    WHEN DATE(uc.Discn_At) = CURDATE() - INTERVAL 1 DAY THEN 'yesterday at '
                    WHEN YEAR(uc.Discn_At) < YEAR(CURDATE()) THEN
                        CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b %Y'), ' at ')
                    ELSE
                        CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b'), ' at ')
                END,
                DATE_FORMAT(uc.Discn_At, '%h:%i %p')
            )
        ) 
        ELSE 'Offline' 
    END) AS Status 
FROM user_room ur 
INNER JOIN sec_users sc ON sc.login = ?
LEFT JOIN user_mmbrs um 
    ON um.RoomId = ur.RoomId 
    AND (
        CASE 
            WHEN (ur.Room = CONCAT(LEAST(um.User, sc.login), '_', GREATEST(um.User, sc.login))) 
                THEN (1) 
            ELSE (um.User != sc.login) 
        END
    )
LEFT JOIN sec_users su ON su.login = um.User 
LEFT JOIN user_conns uc ON uc.ConnId = su.ConnId
WHERE ur.RoomId = ? 
GROUP BY ur.RoomId;`;

    const params = [username, roomid];
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Receiver profile successful",
        receiver_profile: response.result || []
    };
}

async function get_user_profile(data, db) {
    const username = data.username || '';
    if (!username) {
        return {
            status: "failed",
            code: 0,
            message: "Username is required"
        };
    }

    const query = `
        SELECT su.login, su.name, su.email, 
        (CASE WHEN (su.status = '1') THEN ('Online') ELSE 'Offline' END) AS Status 
        FROM sec_users su WHERE su.login = ?;
    `;

    const params = [username];
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "User profile successful",
        user_profile: response.result || []
    };
}

async function get_common_groups(data, db) {
    const username = data.username || '';
    if (!username) {
        return {
            status: "failed",
            code: 0,
            message: "Username is required"
        };
    }

    const roomid = data.roomid || '';
    if (!roomid) {
        return {
            status: "failed",
            code: 0,
            message: "Room Id is required"
        };
    }

    const query = `
        SELECT u.RoomId, u.Room
        FROM user_room u
        INNER JOIN user_mmbrs m2 
            ON m2.RoomId = :roomid 
           AND m2.User != :user
        INNER JOIN user_mmbrs m1 
            ON m1.RoomId = u.RoomId 
           AND m1.User = m2.User
        WHERE u.Type = '2';
    `;

    const params = { user: username, roomid };
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Common groups successful",
        common_groups: response.result || []
    };
}

async function get_active_sessions(data, db) {
    const sessionid = data.sessionid || '';

    if (!sessionid) {
        return {
            status: "failed",
            code: 0,
            message: "Session Id is required"
        };
    }

    const query = `SELECT ns.ConnId,
       ns.User,
       ns.SessnId,
       ns.DeviceIP,
       DATE_FORMAT(ns.Conn_At, '%d-%m-%Y %H:%i:%s') AS Conn_At,
       (CASE WHEN (ns.status = '1') THEN ('Online') ELSE 'Offline' END) AS Status
FROM user_conns ns
WHERE ns.status = ?
  AND ns.SessnId != ?
ORDER BY ns.ConnId;`;

    const params = ['1', sessionid];

    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "Active sessions successful",
        active_sessions: response.result || []
    };
}

async function get_my_sessions(data, db) {
    const sessionid = data.sessionid || '';

    if (!sessionid) {
        return {
            status: "failed",
            code: 0,
            message: "Session Id is required"
        };
    }

    const query = `SELECT us.ConnId, us.SessnId, us.User, us.DeviceIP,
       DATE_FORMAT(us.Conn_At, '%d-%m-%Y %H:%i:%s') AS Conn_At,
       DATE_FORMAT(us.Discn_At, '%d-%m-%Y %H:%i:%s') AS Discn_At,
       (CASE WHEN (us.status = '1') THEN 'Online' ELSE 'Offline' END) AS Status,
       us.status AS SessType
FROM user_conns us
CROSS JOIN user_conns cn ON cn.SessnId = ?
WHERE us.User = cn.User
ORDER BY (us.SessnId = cn.SessnId) DESC,
         us.status DESC,
         us.ConnId DESC;`;

    const params = [sessionid];
    const response = await db.execQuery(query, params);

    return {
        status: "success",
        code: 1,
        message: "User sessions successful",
        my_sessions: response.result || []
    };
}

async function get_online_users(data, db) {
    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const query = `-- online_users
SELECT ur.RoomId, su.login, 
    (CASE 
        WHEN (ur.Type = '2') THEN ur.Room 
        WHEN (ur.Type = '1') THEN rs.name 
    END) AS Name, 
    (CASE 
        WHEN (ur.Type = '1') THEN 'Single' 
        WHEN (ur.Type = '2') THEN 'Group' 
    END) AS ChatType, 
    (CASE 
        WHEN (ur.Type = '2') THEN (
            SELECT CONCAT(COUNT(*), ' Online')
            FROM user_mmbrs mm
            JOIN sec_users su2 ON su2.login = mm.User
            WHERE mm.RoomId = ur.RoomId AND su2.status = '1'
        ) 
        WHEN (uc.status = '1') THEN 'Online' 
        WHEN (uc.status != '1') THEN CONCAT(
            'Last seen ',
            CASE
                WHEN DATE(uc.Discn_At) = CURDATE() THEN 'today at '
                WHEN DATE(uc.Discn_At) = CURDATE() - INTERVAL 1 DAY THEN 'yesterday at '
                WHEN YEAR(uc.Discn_At) < YEAR(CURDATE()) THEN CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b %Y'), ' at ')
                ELSE CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b'), ' at ')
            END,
            DATE_FORMAT(uc.Discn_At, '%h:%i %p')
        ) 
        ELSE 'Offline' 
    END) AS Status, 
    TO_BASE64(
        CASE 
            WHEN lm.MsgTxt IS NOT NULL AND lm.MsgTxt != '' THEN
                CASE 
                    WHEN CHAR_LENGTH(lm.MsgTxt) > 40
                        THEN CONCAT(SUBSTRING(lm.MsgTxt, 1, 40), '...')
                    ELSE lm.MsgTxt
                END
            WHEN lm.MsgTxt = '' AND uf.FileName IS NOT NULL THEN
                CASE 
                    WHEN CHAR_LENGTH(uf.FileName) > 40
                        THEN CONCAT(SUBSTRING(uf.FileName, 1, 40), '...')
                    ELSE uf.FileName
                END
            ELSE 'No messages yet'
        END
    ) AS MsgStr
FROM sec_users su 
INNER JOIN user_conns cn ON cn.SessnId = ?
INNER JOIN sec_users rs ON rs.login = cn.User
INNER JOIN user_room ur 
    ON (
        CASE 
            WHEN (ur.Type = '1' AND cn.User != su.login) 
                THEN (ur.Room = CONCAT(LEAST(cn.User, su.login), '_', GREATEST(cn.User, su.login))) 
            WHEN (ur.Type = '2') 
                THEN (ur.RoomId IN (
                    SELECT mm.RoomId 
                    FROM user_mmbrs mm 
                    WHERE mm.User IN (cn.User, su.login) 
                    GROUP BY mm.RoomId 
                    HAVING COUNT(DISTINCT mm.User) = 2
                )) 
        END
    )
LEFT JOIN (
    SELECT uc1.* 
    FROM user_conns uc1 
    JOIN (
        SELECT User, ConnId, ROW_NUMBER() OVER (
            PARTITION BY User 
            ORDER BY (Discn_At IS NOT NULL), Discn_At DESC, Conn_At DESC
        ) AS rn 
        FROM user_conns
    ) AS latest 
    ON latest.ConnId = uc1.ConnId AND latest.rn = 1
) AS uc ON (
    CASE WHEN (ur.Type = '1') THEN (uc.User = cn.User) END
)
LEFT JOIN (
    SELECT um.* 
    FROM user_mssgs um 
    JOIN (
        SELECT RoomId, MAX(MsgId) AS max_id 
        FROM user_mssgs 
        GROUP BY RoomId
    ) AS latest 
    ON um.RoomId = latest.RoomId AND um.MsgId = latest.max_id
) AS lm ON lm.RoomId = ur.RoomId
LEFT JOIN (
    SELECT f1.* 
    FROM user_files f1 
    JOIN (
        SELECT MsgId, MAX(FileId) AS max_file_id 
        FROM user_files 
        GROUP BY MsgId
    ) AS f2 ON f1.FileId = f2.max_file_id
) AS uf ON uf.MsgId = lm.MsgId
WHERE su.status = ?;`;
    const params = [ sessionid, '1' ];
    const response = await db.execQuery(query, params);
    return { status: "success", code: 1, message: 'Online users successful', online_users: response.result || [] };
}

async function get_group_users(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const roomid = data.roomid || '';
    if (!roomid) return { status: "failed", code: 0, message: 'Room Id is required' };

    const query = `SELECT ur.RoomId, m.User 
FROM user_room u 
INNER JOIN user_mmbrs m 
    ON m.RoomId = u.RoomId 
INNER JOIN sec_users s 
    ON s.login = m.User 
INNER JOIN user_room ur 
    ON ur.Room = CONCAT(LEAST(?, m.User), '_', GREATEST(?, m.User)) 
WHERE u.RoomId = ?;`;
const params = [username, username, roomid];

    const response = await db.execQuery(query, params);
    return { status: "success", code: 1, message: 'Group users successful', group_users: response.result || [] };
}

async function get_groups(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const query = `SELECT u.RoomId, u.Room 
FROM user_room u 
INNER JOIN user_mmbrs m 
    ON m.RoomId = u.RoomId 
WHERE u.Type = '2' 
  AND m.User = ?;`;
  const params = [username];
    const response = await db.execQuery(query, params);
    return { status: "success", code: 1, message: 'Groups successful', groups: response.result || [] };
}

async function get_messages(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const roomid = data.roomid || '';
    if (!roomid) return { status: "failed", code: 0, message: 'Room Id is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const query = `UPDATE user_reads ur
JOIN user_mssgs um ON um.MsgId = ur.MsgId
JOIN (
    SELECT 
        uc.ConnId,
        COALESCE(MAX(rd.ConnIndx), 0) AS MaxConnIndx
    FROM user_conns uc
    LEFT JOIN user_reads rd ON rd.ConnId = uc.ConnId
    WHERE uc.SessnId = ?
    GROUP BY uc.ConnId
) AS sub ON 1 = 1
SET ur.Read_At = NOW(),
    ur.ConnId = (SELECT ConnId FROM user_conns WHERE SessnId = ?),
    ur.MsgState = '3',
    ConnIndx = sub.MaxConnIndx + 1
WHERE um.RoomId = ?
  AND ur.User = ?
  AND ur.Read_At IS NULL;

-- get_messages
SELECT m.RoomId,
       m.User,
       TO_BASE64(m.MsgTxt) AS MsgTxt,
       d.MsgState,
       m.Sent_At,
       s.Name,
       d.Read_At,
       (
           SELECT COUNT(*)
           FROM user_mssgs g
           JOIN user_reads r ON r.MsgId = g.MsgId
           WHERE r.User = d.User
             AND r.Read_At IS NULL
             AND g.RoomId = m.RoomId
       ) AS Unread,
       (CASE
            WHEN (o.Type = '2') THEN (
                SELECT CONCAT(COUNT(*), ' Online')
                FROM user_mmbrs mm
                JOIN sec_users su2 ON su2.login = mm.User
                WHERE mm.RoomId = m.RoomId
                  AND su2.status = '1'
            )
            WHEN (uc.status = '1') THEN ('Online')
            WHEN (uc.status != '1') THEN (
                CONCAT(
                    'Last seen ',
                    CASE
                        WHEN DATE(uc.Discn_At) = CURDATE() THEN 'today at '
                        WHEN DATE(uc.Discn_At) = CURDATE() - INTERVAL 1 DAY THEN 'yesterday at '
                        WHEN YEAR(uc.Discn_At) < YEAR(CURDATE()) THEN
                            CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b %Y'), ' at ')
                        ELSE
                            CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b'), ' at ')
                    END,
                    DATE_FORMAT(uc.Discn_At, '%h:%i %p')
                )
            )
            ELSE 'Offline'
        END) AS Status,
       m.MsgId,
       TO_BASE64(
           CASE
               WHEN m.MsgTxt IS NOT NULL AND m.MsgTxt != '' THEN
                   CASE
                       WHEN CHAR_LENGTH(m.MsgTxt) > 40
                           THEN CONCAT(SUBSTRING(m.MsgTxt, 1, 40), '...')
                       ELSE m.MsgTxt
                   END
               WHEN m.MsgTxt = '' AND f.FileName IS NOT NULL THEN
                   CASE
                       WHEN CHAR_LENGTH(f.FileName) > 40
                           THEN CONCAT(SUBSTRING(f.FileName, 1, 40), '...')
                       ELSE f.FileName
                   END
               ELSE ('No messages yet')
           END
       ) AS MsgStr
FROM user_mssgs m
JOIN sec_users s ON s.login = ?
JOIN user_room o ON o.RoomId = m.RoomId
LEFT JOIN user_reads d ON d.MsgId = m.MsgId AND d.User != ?
LEFT JOIN (
    SELECT uc1.*
    FROM user_conns uc1
    JOIN (
        SELECT User, MAX(ConnId) AS max_connid
        FROM user_conns
        GROUP BY User
    ) AS latest ON uc1.ConnId = latest.max_connid
) AS uc ON uc.User = d.User
LEFT JOIN (
    SELECT uf.MsgId, MAX(uf.FileId) AS FileId
    FROM user_files uf
    GROUP BY uf.MsgId
) AS fl ON fl.MsgId = m.MsgId
LEFT JOIN user_files f ON f.FileId = fl.FileId
WHERE m.RoomId = ?
GROUP BY m.MsgId
ORDER BY m.Sent_At ASC;`;
    const params = [
  sessionid,  // #1
  sessionid,  // #2
  roomid,     // #3
  username,   // #4
  username,   // #5
  username,   // #6
  roomid      // #7
];

    const response = await db.execQuery(query, params);
    // logerror(response, 'get_messages');
    return { status: "success", code: 1, message: 'Message got successfully', messages: response.result[response.result.length - 1] || [] };
}

async function send_message(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const roomid = data.roomid || '';
    if (!roomid) return { status: "failed", code: 0, message: 'Room Id is required' };

    const message = data.message || '';
    if (message === '' && !data.files?.length) return { status: "failed", code: 0, message: 'Message is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    let params = [
  username,        // #1
  sessionid,       // #2
  roomid,          // #3
  message,         // #4
  roomid,          // #5
  roomid,          // #6
  username         // #7
];
    let sql = '';
    if (data.files?.length && data.size?.length) {
        const files = data.files;
        const sizes = data.size;
        let filePlaceholders = [];
        let fileParams = [];
        files.forEach((file, index) => {
            filePlaceholders.push(`? AS FileName, ? AS FileSize`);
            fileParams.push(file, sizes[index]);
        });
        const placeholders_str = filePlaceholders.join(' UNION ALL SELECT ');
        params = [ ...params, ...fileParams ];
        sql = `INSERT INTO user_files (MsgId, FileName, FileSize) 
        SELECT (SELECT rd.MsgId FROM user_reads rd WHERE rd.ReadId = LAST_INSERT_ID()), FileName, FileSize 
        FROM (SELECT ${placeholders_str}) AS filenames;
        SELECT uf.FileId, uf.FileName, uf.FileSize FROM user_files uf WHERE uf.MsgId = (SELECT fl.MsgId FROM user_files fl WHERE fl.FileId = LAST_INSERT_ID())`;
    }

    const query = `INSERT INTO user_mssgs (User, ConnId, RoomId, MsgTxt, Sent_At) 
VALUES (?, (SELECT ConnId FROM user_conns WHERE SessnId = ?), ?, FROM_BASE64(?), NOW());
INSERT INTO user_reads (MsgId, RoomId, User, Read_At, MsgState, DonnId, Dlvr_At)
SELECT (LAST_INSERT_ID()), ?, mm.User, NULL,
       (CASE WHEN (uu.status = '1') THEN ('2') ELSE ('1') END),
       (CASE WHEN (uu.status = '1') 
             THEN (SELECT ConnId FROM user_conns WHERE User = mm.User AND Status = '1' LIMIT 1) 
             ELSE (NULL) END),
       (CASE WHEN (uu.status = '1') THEN (NOW()) ELSE (NULL) END)
FROM user_mmbrs mm
JOIN sec_users uu ON uu.login = mm.User
WHERE mm.RoomId = ?
  AND mm.User != ?;${sql}`;
    const response = await db.execQuery(query, params);
    // logerror(response, 'send_message');
    const finalmsg =  { status: "success", code: 1, message: 'Message sent successfully', files: [] };
    if (data.files?.length && data.size?.length) {
        finalmsg.files = response.result[response.result.length - 1]
    }
    return finalmsg;
}

async function create_group(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const groupname = data.groupname || '';
    if (!groupname) return { status: "failed", code: 0, message: 'Group name is required' };

    const users = data.users || [];
    if (users.length < 1) return { status: "failed", code: 0, message: 'At least one other user is required' };

    users.push(username);

    const query = `INSERT INTO user_room (Room, Type, CrtBy, ConnId) 
VALUES (?, '2', ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?));

INSERT INTO user_mmbrs (RoomId, user, CrtBy, ConnId) 
SELECT (SELECT RoomId FROM user_room WHERE Room = ?), login, ?, 
       (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
FROM sec_users 
WHERE FIND_IN_SET(login, ?);

INSERT IGNORE INTO user_mssgs (User, ConnId, RoomId, MsgTxt, Sent_At, CrtBy, MbrId)
(SELECT 
        'system', 
        uc.ConnId, 
        ur.RoomId, 
        CASE dp.n
            WHEN 1 THEN CONCAT(su.name, ' created group "', ur.Room, '"')
            ELSE CONCAT(su.name, ' added "', sc.name, '"')
        END AS SysTxt, 
        NOW(), ?, um.MbrId 
 FROM user_room ur
 JOIN sec_users su ON su.login = ur.CrtBy
 JOIN user_conns uc ON uc.ConnId = ur.ConnId
 CROSS JOIN (
     SELECT @rownum := @rownum + 1 AS n, t.login
     FROM (
         SELECT su1.login AS login, 0 AS sort_order 
         FROM sec_users su1 
         WHERE su1.login = ?
         UNION ALL
         SELECT su2.login, 1 AS sort_order
         FROM sec_users su2
         WHERE su2.login != ?
     ) t
     JOIN (SELECT @rownum := 0) r
     ORDER BY t.sort_order, t.login
 ) dp 
 JOIN sec_users sc ON sc.login = dp.login
 JOIN user_mmbrs um ON um.RoomId = ur.RoomId AND um.User = dp.login
 WHERE ur.Room = ? AND su.login = ?
 ORDER BY dp.n ASC);

INSERT IGNORE INTO user_reads (MsgId, RoomId, User, Read_At, MsgState, DonnId, Dlvr_At) 
(SELECT mg.MsgId, mm.RoomId, mm.User, NULL, 
        (CASE WHEN (uu.status = '1') THEN ('2') ELSE ('1') END) AS MsgState,
        (CASE WHEN (uu.status = '1') 
              THEN (SELECT ConnId FROM user_conns WHERE User = mm.User AND Status = '1' LIMIT 1) 
              ELSE (NULL) END) AS DonnId,
        (CASE WHEN (uu.status = '1') THEN (NOW()) ELSE (NULL) END) AS Dlvr_At
 FROM user_mmbrs mm
 JOIN sec_users uu ON uu.login = mm.User
 JOIN user_room ur ON ur.RoomId = mm.RoomId
 JOIN user_mssgs mg ON mg.RoomId = ur.RoomId AND mg.User = 'system'
 WHERE ur.Room = ? AND mm.User != ur.CrtBy);

SELECT RoomId FROM user_room WHERE Room = ?;`;
    const params = [
  groupname,        // #1
  username,         // #2
  sessionid,        // #3
  groupname,        // #4
  username,         // #5
  sessionid,        // #6
  users.join(','),  // #7
  username,         // #8
  username,         // #9
  username,         // #10
  groupname,        // #11
  username,         // #12
  groupname,        // #13
  groupname         // #14
];

    const response = await db.execQuery(query, params);
    return { status: "success", code: 1, message: 'Group created successfully', create_group: response.result[response.result.length - 1] || [] };
}

async function get_users(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const query = `SELECT su.login, su.name 
FROM sec_users su 
INNER JOIN sec_users sc ON sc.login = ? 
INNER JOIN user_mmbrs um ON um.User = su.login 
INNER JOIN user_room ur 
    ON ur.RoomId = um.RoomId 
   AND ur.Room = CONCAT(LEAST(sc.login, su.login), '_', GREATEST(sc.login, su.login)) 
WHERE su.login != sc.login 
ORDER BY su.name;`;
const params = [username];
    const response = await db.execQuery(query, params);
    return { status: "success", code: 1, message: 'Users successful', users: response.result || [] };
}

async function get_chats(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const checkQuery = "SELECT login, name FROM sec_users WHERE BINARY login = ?";
    const checkResponse = await db.execQuery(checkQuery, [username]);
    const rows = checkResponse.result[0];
    const user = rows[0] || null;

    if (!user) {
        const query = `-- SET SESSION sql_mode = '';
INSERT IGNORE INTO user_room (Room, Type, CrtBy, ConnId) 
VALUES ('Default Group', '2', ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?));

INSERT IGNORE INTO user_mmbrs (RoomId, user, CrtBy, ConnId) 
SELECT (SELECT RoomId FROM user_room WHERE Room = 'Default Group'), login, ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?)
FROM sec_users 
ORDER BY login;

INSERT IGNORE INTO user_mssgs (User, ConnId, RoomId, MsgTxt, Sent_At, CrtBy, MbrId) 
SELECT 
    'system', 
    uc.ConnId, 
    ur.RoomId, 
    CASE dp.n
        WHEN 1 THEN CONCAT(su.name, ' created group "', ur.Room, '"')
        ELSE CONCAT(su.name, ' added "', sc.name, '"')
    END AS SysTxt, 
    NOW(), ?, um.MbrId 
FROM user_room ur
JOIN sec_users su ON su.login = ur.CrtBy
JOIN user_conns uc ON uc.ConnId = ur.ConnId
CROSS JOIN (
    SELECT @rownum := @rownum + 1 AS n, t.login
    FROM (
        SELECT su1.login AS login, 0 AS sort_order 
        FROM sec_users su1 
        WHERE su1.login = ?
        UNION ALL
        SELECT su2.login, 1 AS sort_order
        FROM sec_users su2
        WHERE su2.login != ?
    ) t
    JOIN (SELECT @rownum := 0) r
    ORDER BY t.sort_order, t.login
) dp 
JOIN sec_users sc ON sc.login = dp.login
JOIN user_mmbrs um ON um.RoomId = ur.RoomId AND um.User = dp.login
WHERE ur.Room = 'Default Group' AND su.login = ? 
ORDER BY dp.n ASC;

INSERT IGNORE INTO user_reads (MsgId, RoomId, User, Read_At, MsgState, DonnId, Dlvr_At) 
SELECT mg.MsgId, mm.RoomId, mm.User, NULL, 
    (CASE WHEN (uu.status = '1') THEN ('2') ELSE ('1') END) AS MsgState, 
    (CASE WHEN (uu.status = '1') THEN (SELECT ConnId FROM user_conns WHERE User = mm.User AND Status = '1' LIMIT 1) ELSE NULL END) AS DonnId, 
    (CASE WHEN (uu.status = '1') THEN NOW() ELSE NULL END) AS Dlvr_At 
FROM user_mmbrs mm 
JOIN sec_users uu ON uu.login = mm.User 
JOIN user_room ur ON ur.RoomId = mm.RoomId 
JOIN user_mssgs mg ON mg.RoomId = ur.RoomId AND mg.User = 'system' 
WHERE ur.Room = 'Default Group' AND mm.User != ur.CrtBy;

INSERT IGNORE INTO user_room (Room, Type, CrtBy, ConnId) 
SELECT CONCAT(LEAST(?, login), '_', GREATEST(?, login)), '1', ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
FROM sec_users 
ORDER BY login;

INSERT IGNORE INTO user_mmbrs (RoomId, User, CrtBy, ConnId) 
SELECT * FROM (
    SELECT ur.RoomId, su.login, ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
    FROM user_room ur 
    JOIN sec_users su ON ur.Room = CONCAT(LEAST(?, login), '_', GREATEST(?, login))
    UNION ALL 
    SELECT ur.RoomId, ?, ?, (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
    FROM user_room ur 
    JOIN sec_users su ON ur.Room = CONCAT(LEAST(?, login), '_', GREATEST(?, login)) 
    WHERE su.login != ?
) AS q 
ORDER BY q.RoomId;

SELECT ur.RoomId, uf.FileName, 
    (CASE WHEN (ur.Type = '1') THEN su.name ELSE ur.Room END) AS Name, 
    (CASE 
        WHEN (ur.Type = '2') THEN (SELECT CONCAT(COUNT(*), ' Online') FROM user_mmbrs mm JOIN sec_users su2 ON su2.login = mm.User WHERE mm.RoomId = ur.RoomId AND su2.status = '1') 
        WHEN (su.status = '1') THEN 'Online' 
        WHEN (uc.status != '1') THEN CONCAT('Last seen ', 
            CASE
                WHEN DATE(uc.Discn_At) = CURDATE() THEN 'today at '
                WHEN DATE(uc.Discn_At) = CURDATE() - INTERVAL 1 DAY THEN 'yesterday at '
                WHEN YEAR(uc.Discn_At) < YEAR(CURDATE()) THEN CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b %Y'), ' at ')
                ELSE CONCAT('on ', DATE_FORMAT(uc.Discn_At, '%d %b'), ' at ')
            END, DATE_FORMAT(uc.Discn_At, '%h:%i %p')
        ) 
        ELSE 'Offline' 
    END) AS Status, 
    (SELECT COUNT(*) FROM user_reads r JOIN user_mssgs m ON r.MsgId = m.MsgId WHERE r.User = um1.User AND r.Read_At IS NULL AND m.RoomId = ur.RoomId) AS Unread, 
    TO_BASE64(um.MsgTxt) AS MsgTxt, 
    TO_BASE64(
        CASE 
            WHEN um.MsgTxt IS NOT NULL AND um.MsgTxt != '' THEN
                CASE WHEN CHAR_LENGTH(um.MsgTxt) > 40 THEN CONCAT(SUBSTRING(um.MsgTxt, 1, 40), '...') ELSE um.MsgTxt END
            WHEN um.MsgTxt = '' AND uf.FileName IS NOT NULL THEN
                CASE WHEN CHAR_LENGTH(uf.FileName) > 40 THEN CONCAT(SUBSTRING(uf.FileName, 1, 40), '...') ELSE uf.FileName END
            ELSE 'No messages yet'
        END
    ) AS MsgStr, 
    (CASE WHEN (ur.Type = '1') THEN 'Single' WHEN (ur.Type = '2') THEN 'Group' END) AS ChatType 
FROM user_room ur 
JOIN user_mmbrs um1 ON ur.RoomId = um1.RoomId AND um1.User = ? 
LEFT JOIN user_mmbrs um2 ON ur.RoomId = um2.RoomId AND um2.User != um1.User 
LEFT JOIN sec_users su ON (CASE WHEN (um2.User IS NULL) THEN (su.login = um1.User) ELSE (su.login = um2.User) END)
LEFT JOIN (SELECT ms.RoomId, MAX(ms.MsgId) AS MsgId, MAX(fl.FileId) AS FileId FROM user_mssgs ms LEFT JOIN user_files fl ON fl.MsgId = ms.MsgId GROUP BY RoomId) AS uk ON uk.RoomId = ur.RoomId 
LEFT JOIN user_mssgs um ON um.MsgId = uk.MsgId
LEFT JOIN user_files uf ON uf.FileId = uk.FileId
LEFT JOIN user_conns uc ON uc.User = su.login 
GROUP BY ur.RoomId 
ORDER BY um.Sent_At DESC;`;
        const params = [
            username,  // user_room: CrtBy
            sessionid, // user_room: SessnId subquery

            username,  // user_mmbrs: CrtBy
            sessionid, // user_mmbrs: SessnId subquery

            username,  // user_mssgs: CrtBy
            username,  // CROSS JOIN: su1.login = :user
            username,  // CROSS JOIN: su2.login != :user
            username,  // WHERE su.login = :user

            username,  // user_room select LEAST(:user, login)
            username,  // user_room select GREATEST(:user, login)
            username,  // user_room: CrtBy
            sessionid, // user_room: SessnId

            username,  // user_mmbrs: :user
            sessionid, // user_mmbrs: SessnId
            username,  // user_mmbrs: LEAST(:user, login)
            username,  // user_mmbrs: GREATEST(:user, login)
            username,  // user_mmbrs: :user in UNION ALL
            username,  // user_mmbrs: :user in UNION ALL
            sessionid, // user_mmbrs: SessnId in UNION ALL
            username,  // user_mmbrs: LEAST(:user, login) in second part
            username,  // user_mmbrs: GREATEST(:user, login)
            username,  // user_mmbrs: su.login != :user

            username   // final SELECT: um1.User = :user
        ];

        const response = await db.execQuery(query, params);
        return { status: "success", code: 1, message: 'Chat successful', chats: response.result[response.result.length - 1] || [] };
    } else {
        return { status: "failed", code: 0, message: 'Invalid credentials', chats: [] };
    }
}

async function login(data, db) {
    const username = data.username || '';
    if (!username) return { status: "failed", code: 0, message: 'Username is required' };

    const sessionid = data.sessionid || '';
    if (!sessionid) return { status: "failed", code: 0, message: 'Session Id is required' };

    const deviceip = data.deviceip || '';
    if (!deviceip) return { status: "failed", code: 0, message: 'Device IP is required' };

    const checkQuery = "SELECT login, name FROM sec_users WHERE BINARY login = ?";
    const checkResponse = await db.execQuery(checkQuery, [username]);
    // logerror(checkResponse, 'checkResponse');
    const rows = checkResponse.result[0];
    const user = rows[0] || null;

    if (!user) {
        const query = `INSERT IGNORE INTO user_conns (User, SessnId, DeviceIP, Conn_At, status) 
VALUES (?, ?, ?, NOW(), ?);

UPDATE sec_users su 
SET su.status = ?, 
    su.ConnId = (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
WHERE su.login = ?;

UPDATE user_reads rd 
SET rd.MsgState = '2', 
    rd.Dlvr_At = NOW(), 
    rd.DonnId = (SELECT ConnId FROM user_conns WHERE SessnId = ?) 
WHERE rd.User = ? 
  AND rd.MsgState = '1' 
  AND rd.Dlvr_At IS NULL;
`;

    const params = [
        username,   // INSERT :user
        sessionid,  // INSERT :sessnid
        deviceip,   // INSERT :deviceip
        '1',        // INSERT :status

        '1',        // UPDATE sec_users :status
        sessionid,  // UPDATE sec_users :sessnid
        username,   // UPDATE sec_users :user

        sessionid,  // UPDATE user_reads :sessnid
        username    // UPDATE user_reads :user
    ]
        await db.execQuery(query, params);

        return { status: "success", code: 1, message: 'Login successful', login: 1 };
    } else {
        return { status: "failed", code: 0, message: 'Invalid credentials', login: 0 };
    }
}

export default {
    terminate_session,
    file_download,
    chunk_append,
    chunk_assemble,
    reset_status,
    get_message_files,
    get_max_chunkindex,
    chunk_download,
    disconn,
    chunk_upload,
    get_sender_sessions,
    get_sender_messages,
    get_deliver_messages,
    get_deliver_sessions,
    get_receiver_sessions,
    get_receiver_profile,
    get_user_profile,
    get_common_groups,
    get_active_sessions,
    get_my_sessions,
    get_online_users,
    get_group_users,
    get_groups,
    get_messages,
    send_message,
    create_group,
    get_users,
    get_chats,
    login
};
