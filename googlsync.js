import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';
import googlconn from './googlconn.js';

async function getemlids(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  if (!login_usr) return { status: "failed", code: 0, message: "Invalid Username.", details: "Set Username." };
  if (!emlid_usr) return { status: "failed", code: 0, message: "Invalid Email Address Id.", details: "Set Email Address Id." };
  const logmsg = await getmsgids(data);
  return logmsg;
}

async function getmsgids(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;

  let unqids = [];
  let npt = 1;

  while (npt) {
    const tknmsg = await googl_sync(emlid_usr, login_usr);
    const lstmsg = await getlst(tknmsg.token, npt);
    unqids = [...unqids, ...(lstmsg.messages || [])];
    npt = lstmsg.nextPageToken ?? 0;
  }
  const logmsg = { status: "success", code: 1, message: "Got all unique id's.", details: unqids, count: unqids.length };
  return logmsg;
}

async function googl_sync(emlid_usr, login_usr) {
  const query = `SELECT a.EmailAddressId AS addresid, a.EmailAddress AS addresname, a.AddressToken, b.EmailSerProId AS serproid, b.EmailSerProName AS serproname, b.ClientSecret FROM emailaddressmst a INNER JOIN emailserpromst b ON b.EmailSerProId = a.EmailSerProId INNER JOIN emailadrsuser c ON c.EmailAddressId = a.EmailAddressId WHERE a.EmailAddressId = ?;`;
  const params = [emlid_usr];  const request = await db.execQuery(query, params);  const arr_temp = request.result; let logmsg;

  const serproid = arr_temp[0].serproid;
  const serproname = arr_temp[0].serproname;
  const ClientSecret = arr_temp[0].ClientSecret;

  const addresid = arr_temp[0].addresid;
  const addresname = arr_temp[0].addresname;
  const AddressToken = arr_temp[0].AddressToken;

  const clientObj = JSON.parse(ClientSecret || '{}');
  let accessObj = JSON.parse(AddressToken || '{}');

  const accesstn = accessObj?.access_token || '';
  const refrestn = accessObj?.refresh_token || '';
  const expireat = accessObj?.expires_at || '';

  if (expireat && refrestn && Math.floor(Date.now() / 1000) > expireat) {
    logmsg = await googlconn.googl_refresh(arr_temp, login_usr);
  } else if (accesstn) {
    logmsg = { status: "success", code: 1, message: "Token is valid.", token: accessObj };
  } else {
    logmsg = { status: "failed", code: 0, message: "Error in access token.", token: accessObj };
  }
  // logmsg = { status: "success", code: 1, message: "All okay.", details: arr_temp };
  return logmsg;
}

async function getlst(accessObj, npt) {
  let url = '';

  if (npt != 1) {
    url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&pageToken=${npt}`;
  } else {
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500';
  }
  const headers = {
    'Authorization': `Bearer ${accessObj.access_token}`
  };

  return await signup.node_fetch(url, "GET", headers);
}

async function batch_getmsg(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  const messageIds = data?.items ?? null;

  if (!login_usr) return { status: "failed", code: 0, message: "No Username.", details: "Set Username." };
  
  if (!emlid_usr) return { status: "failed", code: 0, message: "No Email Address Id.", details: "Set Email Address Id." };

  if (!messageIds) return { status: "failed", code: 0, message: "No message IDs provided.", details: "Set message IDs." };

  const logmsg = await batchGetMessages(data);
  return logmsg;
}

async function batchGetMessages(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  const messageIds = data?.items ?? null;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < messageIds.length; i++) {
    let msg = {};
    try {
      msg.unqid = messageIds[i].id;
      msg.seqid = messageIds[i].idx;
      msg.adrid = emlid_usr;
      msg.usrid = login_usr;
      Object.assign(msg, await geteml(login_usr, emlid_usr, messageIds[i].id, msg));
      success = success + 1;
    } catch (oe) {
      failed = failed + 1;
      try {
        let msg = {}; let logmsg;
        logmsg = JSON.parse(oe.message);  msg.msg = logmsg;
      } catch {
        msg.msg = { status: "error", code: 0, message: "Error Occurred.", details: { message: oe.message, name: oe.name, stack: oe.stack } };
      }
      const qry_ins_emlmsg = `INSERT IGNORE INTO emailmessage (EmailUnqId, EmailAdrsId, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, ?, FROM_BASE64(?), ?, ?);`;
      const prm_ins_emlmsg = [msg.unqid, msg.adrid, '0', msg.msg.code, Buffer.from(JSON.stringify(msg.msg, null, 2)).toString('base64'), msg.usrid, msg.usrid];
      const res_ins_emlmsg = await db.execQuery(qry_ins_emlmsg, prm_ins_emlmsg);  const arr_ins_emlmsg = res_ins_emlmsg.result;
    }
    logerror(msg.msg, `Sub Catch ${msg.seqid}`);
  }
  return { status: "success", code: 1, message: "Batch messages processed", success, failed };
}

async function geteml(login_usr, emlid_usr, unqid_usr, msg) {
  const tknmsg = await googl_sync(emlid_usr, login_usr);
  if ( tknmsg.code == 1 ) {
    let frm = '', to = '', cc = '', bcc = '', lblid = '', qry_ins_emlmsg = '', prm_ins_emlmsg = [];
    ['frm', 'to', 'cc', 'bcc', 'lblid'].forEach(k => msg[k] = []);
    ['date', 'hstid'].forEach(k => msg[k] = null);
    ['Subject', 'plain', 'html', 'thdid', 'MessageID', 'InReplyTo', 'References'].forEach(k => msg[k] = '');
    Object.assign(msg, await getmsg(tknmsg.token, unqid_usr, msg));
    if ( msg.msg.code == 1 ) {
      if (msg.frm && msg.frm.length > 0) {
        qry_ins_emlmsg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.frm.map(() => '(?, ?, ?, ?)').join(', ')};`;
        msg.frm.forEach(email => { prm_ins_emlmsg.push(email, '0', login_usr, login_usr); });
        frm = msg.frm.join(',');
      }
      if (msg.to && msg.to.length > 0) { 
        qry_ins_emlmsg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.to.map(() => '(?, ?, ?, ?)').join(', ')};`; 
        msg.to.forEach(email => { prm_ins_emlmsg.push(email, '0', login_usr, login_usr); }); 
        to = msg.to.join(','); 
      }
      if (msg.cc && msg.cc.length > 0) { 
        qry_ins_emlmsg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.cc.map(() => '(?, ?, ?, ?)').join(', ')};`; 
        msg.cc.forEach(email => { prm_ins_emlmsg.push(email, '0', login_usr, login_usr); }); 
        cc = msg.cc.join(','); 
      }

      if (msg.bcc && msg.bcc.length > 0) { 
        qry_ins_emlmsg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.bcc.map(() => '(?, ?, ?, ?)').join(', ')};`; 
        msg.bcc.forEach(email => { prm_ins_emlmsg.push(email, '0', login_usr, login_usr); }); 
        bcc = msg.bcc.join(','); 
      }

      if (msg.lblid && msg.lblid.length > 0) { 
        qry_ins_emlmsg += `INSERT IGNORE INTO emaillabelmst (LabelId, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.lblid.map(() => '(?, ?, ?, ?)').join(', ')};`; 
        msg.lblid.forEach(label => { prm_ins_emlmsg.push(label, '0', login_usr, login_usr); }); 
        lblid = msg.lblid.join(','); 
      }

      qry_ins_emlmsg += "INSERT IGNORE INTO emailmessage (EmailUnqId, EmailAdrsId, EmailDate, EmailFrm, EmailTo, EmailCc, EmailBcc, EmailSubj, BdyTxt, BdyHtml, HistoryId, LabelIds, ThreadId, MessageID, InReplyTo, `References`, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, (SELECT GROUP_CONCAT(EmailLabelId) FROM emaillabelmst WHERE FIND_IN_SET(LabelId, ?)), ?, FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);";

      prm_ins_emlmsg.push(msg.unqid, msg.adrid, msg.date, frm, to, cc, bcc, Buffer.from(msg.Subject ?? '', 'utf8').toString('base64'), msg.plain ?? '', msg.html ?? '', msg.hstid, lblid, msg.thdid, Buffer.from(msg.MessageID ?? '', 'utf8').toString('base64'), Buffer.from(msg.InReplyTo ?? '', 'utf8').toString('base64'), Buffer.from(msg.References ?? '', 'utf8').toString('base64'), '0', msg.msg.code, Buffer.from(JSON.stringify(msg.msg, null, 2)).toString('base64'), msg.usrid, msg.usrid);

      Object.assign(msg, await getatt(login_usr, emlid_usr, unqid_usr, msg, qry_ins_emlmsg, prm_ins_emlmsg));

    } else {
      qry_ins_emlmsg += `INSERT IGNORE INTO emailmessage (EmailUnqId, EmailAdrsId, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, ?, FROM_BASE64(?), ?, ?);`;
      prm_ins_emlmsg.push(msg.unqid, msg.adrid, '0', msg.msg.code, Buffer.from(JSON.stringify(msg.msg, null, 2)).toString('base64'), msg.usrid, msg.usrid);
      const res_ins_emlmsg = await db.execQuery(qry_ins_emlmsg, prm_ins_emlmsg);  const arr_ins_emlmsg = res_ins_emlmsg.result;
    }
  } else {
    msg.msg = tknmsg;
    qry_ins_emlmsg += `INSERT IGNORE INTO emailmessage (EmailUnqId, EmailAdrsId, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, ?, FROM_BASE64(?), ?, ?);`;
    prm_ins_emlmsg.push(msg.unqid, msg.adrid, '0', msg.msg.code, Buffer.from(JSON.stringify(msg.msg, null, 2)).toString('base64'), msg.usrid, msg.usrid);
    const res_ins_emlmsg = await db.execQuery(qry_ins_emlmsg, prm_ins_emlmsg);  const arr_ins_emlmsg = res_ins_emlmsg.result;
  }
  return msg;
}

async function getmsg(accessObj, unqid_usr, msg) {
  const url = `https://gmail.googleapis.com//gmail/v1/users/me/messages/${unqid_usr}?format=full`;
  const headers = { 'Authorization': `Bearer ${accessObj.access_token}` };
  const rawmsg = await signup.node_fetch(url, "GET", headers);
  msg.msg = { status: "success", code: 1, message: "Success obtaining message." };
  Object.assign(msg, await message(rawmsg, msg));
  return msg;
}

async function message(message, msg) {
  msg.thdid = message.threadId;
  msg.hstid = message.historyId;
  msg.lblid = Array.isArray(message.labelIds) && message.labelIds.length > 0 ? message.labelIds : [];

  if (message.payload && Object.keys(message.payload).length > 0) {
    Object.assign(msg, await payload(message.payload, msg));
  }
  return msg;
}

async function payload(payload, msg) {
  if (payload.headers && payload.headers.length > 0) {
    Object.assign(msg, await headers(payload.headers, msg));
  }

  if (payload.body && Object.keys(payload.body).length > 0) {
    let filename = '';
    if (!payload.filename || payload.filename === '') {
      filename = msg.filename && msg.filename !== '' ? msg.filename : '';
    } else {
      filename = payload.filename;
    }
    Object.assign(msg, await body(payload.body, filename, payload.mimeType, msg));
  }

  if (payload.parts && payload.parts.length > 0) {
    Object.assign(msg, await parts(payload.parts, msg));
  }

  return msg;
}

async function headers(headers, msg) {
  const arr_hd = [
    'Date', 'Authentication-Results', 'Delivered-To', 'Subject', 'Message-ID',
    'In-Reply-To', 'References', 'Cc', 'Bcc', 'From', 'To', 'Received-SPF',
    'ARC-Authentication-Results', 'X-Sender', 'X-Source-Auth', 'Received', 'Content-Disposition'
  ];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (arr_hd.includes(h.name) && h.value && h.value !== '') {
      Object.assign(msg, await displayhd(h, msg));
    }
  }

  return msg;
}

async function displayhd(headers, msg) {
  const arr_fr = ['Authentication-Results', 'From', 'Received-SPF', 'ARC-Authentication-Results', 'X-Sender', 'X-Source-Auth'];
  const arr_to = ['Delivered-To', 'To', 'Received'];
  const arr_cc = ['Cc', 'Bcc'];

  const name = headers.name;
  const value = headers.value;

  if (name == 'Date' && value) {
    msg.date = await removeTimezoneAndFormat(value);
  } 
  else if (arr_fr.includes(name) && value) {
    Object.assign(msg, { frm: await pattern(name, value) });
  } 
  else if (arr_to.includes(name) && value) {
    Object.assign(msg, { to: await pattern(name, value) });
  } 
  else if (name == 'Cc' && value) {
    Object.assign(msg, { cc: await pattern(name, value) });
  } 
  else if (name == 'Bcc' && value) {
    Object.assign(msg, { bcc: await pattern(name, value) });
  } 
  else if (name == 'Subject' && value) {
    msg.Subject = value;
  } 
  else if (name == 'Message-ID' && value) {
    msg.MessageID = value;
  } 
  else if (name == 'In-Reply-To' && value) {
    msg.InReplyTo = value;
  } 
  else if (name == 'References' && value) {
    msg.References = value;
  } 
  else if (name == 'Content-Disposition' && value) {
    Object.assign(msg, { filename: await getFileNameFromContentDisposition(value) });
  }

  return msg;
}

async function removeTimezoneAndFormat(value) {
  // Remove timezone offset like " +0530" or " -0800"
  const datetimeWithoutTimezone = value.replace(/ [+-]\d{4}$/, '');

  // Parse into JavaScript Date
  const datetime = new Date(datetimeWithoutTimezone);

  // Format as 'YYYY-MM-DD HH:mm:ss'
  const yyyy = datetime.getFullYear();
  const mm = String(datetime.getMonth() + 1).padStart(2, '0');
  const dd = String(datetime.getDate()).padStart(2, '0');
  const hh = String(datetime.getHours()).padStart(2, '0');
  const min = String(datetime.getMinutes()).padStart(2, '0');
  const ss = String(datetime.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

async function pattern(name, value) {
  const arr_fr = ['Authentication-Results', 'From', 'Received-SPF', 'ARC-Authentication-Results', 'X-Sender', 'X-Source-Auth'];
  const arr_to = ['Delivered-To', 'To', 'Received'];
  const arr_mul = [...arr_to, 'Cc', 'Bcc'];
  const arr_sin = arr_fr;

  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = value.match(emailPattern) || [];

  // Remove duplicates
  return [...new Set(matches)];
}

async function getFileNameFromContentDisposition(contentDisposition) {
  const matches = contentDisposition.match(/filename="([^"]+)"/);
  return matches ? matches[1] : '';
}

async function body(body, filename, mimetype, msg) {
  // Handle inline body data
  if (body.data && body.data !== '') {
    const decode = await base64UrlDecode(body.data);
    if (mimetype == 'text/plain') {
      Object.assign(msg, { plain: decode });
    } else if (mimetype == 'text/html') {
      Object.assign(msg, { html: decode });
    }
  }

  // Handle attachments
  if (body.attachmentId && body.attachmentId !== '') {
    if (mimetype == 'message/rfc822') {
      filename = 'noname.eml';
    }
    if (!msg.attach) msg.attach = [];
    msg.attach.push({ attachid: body.attachmentId, filename, filesize: body.size });
  }

  return msg;
}

async function base64UrlDecode(data) {
  // Replace URL-safe characters with base64 characters
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Decode Base64 to string
  return Buffer.from(base64, 'base64').toString('base64');
}

async function parts(parts, msg) {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && Object.keys(parts[i]).length > 0) {
      Object.assign(msg, await payload(parts[i], msg));
    }
  }
  return msg;
}

async function getatt(login_usr, emlid_usr, unqid_usr, msg, qry_ins_emlmsg, prm_ins_emlmsg) {
  if (msg.attach && msg.attach.length > 0) {
    for (let i = 0; i < msg.attach.length; i++) {
      msg.attach[i].UnqIndx = i + 1;
      const tknmsg = await googl_sync(emlid_usr, login_usr);
      if ( tknmsg.code == 1 ) {
        Object.assign(msg, await attachment(tknmsg.token, i, msg)); let att = msg.attach[i];
        if (att.att.code == 1) {
          qry_ins_emlmsg += `INSERT IGNORE INTO emailattachment (EmailMessageId, UnqIndx, Attachment, FileName, FileSize, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES ((SELECT EmailMsgId FROM emailmessage WHERE EmailAdrsId = ? AND EmailUnqId = ?), ?, FROM_BASE64(?), FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);`;
          prm_ins_emlmsg.push(msg.adrid, msg.unqid, att.UnqIndx, att.attachment ?? '', Buffer.from(att.filename ?? '', 'utf8').toString('base64'), att.filesize, att.att.code, Buffer.from(JSON.stringify(att.att, null, 2)).toString('base64'), msg.usrid, msg.usrid);
        } else {
          qry_ins_emlmsg += `INSERT IGNORE INTO emailattachment (EmailMessageId, UnqIndx, FileName, FileSize, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES ((SELECT EmailMsgId FROM emailmessage WHERE EmailAdrsId = ? AND EmailUnqId = ?), ?, FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);`;
          prm_ins_emlmsg.push(msg.adrid, msg.unqid, att.UnqIndx, Buffer.from(att.filename ?? '', 'utf8').toString('base64'), att.filesize, att.att.code, Buffer.from(JSON.stringify(att.att, null, 2)).toString('base64'), msg.usrid, msg.usrid);
        }
      } else {
        let att = { ...msg.attach[i], att: logmsg };
        qry_ins_emlmsg += `INSERT IGNORE INTO emailattachment (EmailMessageId, UnqIndx, FileName, FileSize, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES ((SELECT EmailMsgId FROM emailmessage WHERE EmailAdrsId = ? AND EmailUnqId = ?), ?, FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);`;
        prm_ins_emlmsg.push(msg.adrid, msg.unqid, att.UnqIndx, Buffer.from(att.filename ?? '', 'utf8').toString('base64'), att.filesize, att.att.code, Buffer.from(JSON.stringify(att.att, null, 2)).toString('base64'), msg.usrid, msg.usrid);

      }
    }
  }
  const res_ins_emlmsg = await db.execQuery(qry_ins_emlmsg, prm_ins_emlmsg);  const arr_ins_emlmsg = res_ins_emlmsg.result;
  return msg;
}

async function attachment(accessObj, i, msg) {
  const url = `https://gmail.googleapis.com//gmail/v1/users/me/messages/${msg.unqid}/attachments/${msg.attach[i].attachid}`;
  const headers = { 'Authorization': `Bearer ${accessObj.access_token}` };
  const attachment = await signup.node_fetch(url, "GET", headers);
  msg.attach[i].att = { status: "success", code: 1, message: "Success obtaining attachment." };
  msg.attach[i].attachment = await base64UrlDecode(attachment.data);
  return msg;
}

export default {
  getemlids,
  batch_getmsg
}