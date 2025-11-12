import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import mailapi from './mailapi.js';
import { logerror } from './buzzapi.js';
import microconn from './microconn.js';

async function setemlids(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  if (!login_usr) return { status: "failed", code: 0, message: "Invalid Username.", details: "Set Username." };
  if (!emlid_usr) return { status: "failed", code: 0, message: "Invalid Email Address Id.", details: "Set Email Address Id." };
  const logmsg = await setmsgids(data);
  return logmsg;
}

async function setmsgids(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  
  let unqids = [];
  let npt = 1;

  while (npt) {
    const tknmsg = await micro_sync(emlid_usr, login_usr);
    const lstmsg = await setlst(tknmsg.token, npt);
    unqids = [...unqids, ...(lstmsg.value || [])];
    npt = lstmsg["@odata.nextLink"] ?? 0;
  }
  const logmsg = { status: "success", code: 1, message: "Got all unique id's.", details: unqids, count: unqids.length };
  return logmsg;
}

async function micro_sync(emlid_usr, login_usr) {
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
    logmsg = await microconn.micro_refresh(arr_temp, login_usr);
  } else if (accesstn) {
    logmsg = { status: "success", code: 1, message: "Token is valid.", token: accessObj };
  } else {
    logmsg = { status: "failed", code: 0, message: "Error in access token.", token: accessObj };
  }
  // logmsg = { status: "success", code: 1, message: "All okay.", details: arr_temp };
  return logmsg;
}

async function setlst(accessObj, npt) {
  let url = '';

  if (npt != 1) {
    url = npt;
  } else {
    url = 'https://graph.microsoft.com/v1.0/me/messages?$select=id&$top=500';
  }
  const headers = {
    'Authorization': `Bearer ${accessObj.access_token}`
  };

  return await signup.node_fetch(url, "GET", headers);
}

async function batch_setmsg(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  const messageIds = data?.items ?? null;

  if (!login_usr) return { status: "failed", code: 0, message: "No Username.", details: "Set Username." };
  
  if (!emlid_usr) return { status: "failed", code: 0, message: "No Email Address Id.", details: "Set Email Address Id." };

  if (!messageIds) return { status: "failed", code: 0, message: "No message IDs provided.", details: "Set message IDs." };

  const logmsg = await batchSetMessages(data);
  return logmsg;
}

async function batchSetMessages(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  const messageIds = data?.items ?? null;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < messageIds.length; i++) {
    let msg = {};
    try {
      msg.unqid = messageIds[i].id; msg.seqid = messageIds[i].idx;  msg.adrid = emlid_usr;  msg.usrid = login_usr;
      ['frm', 'to', 'cc', 'bcc', 'lblid', 'prm_msg', 'prm_att'].forEach(k => msg[k] = []);
      ['from', 'toto', 'cccc', 'bbcc', 'lbll'].forEach(k => msg[k] = '');
      ['date', 'hstid'].forEach(k => msg[k] = null);
      ['Subject', 'plain', 'html', 'thdid', 'MessageID', 'InReplyTo', 'References', 'qry_msg', 'qry_att'].forEach(k => msg[k] = '');
      Object.assign(msg, await seteml(msg));
      success = success + 1;
      msg.msg = { status: "success", code: 1, message: "Success inserting message." };
    } catch (oe) {
      failed = failed + 1;
      try {
        msg.msg = JSON.parse(oe.message);
      } catch {
        msg.msg = { status: "error", code: 0, message: "Error Occurred.", details: { message: oe.message, name: oe.name, stack: oe.stack } };
      }
    }
    msg.qry_msg += "INSERT INTO emailmessage (EmailUnqId, EmailAdrsId, EmailDate, EmailFrm, EmailTo, EmailCc, EmailBcc, EmailSubj, BdyTxt, BdyHtml, HistoryId, LabelIds, ThreadId, MessageID, InReplyTo, `References`, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, (SELECT GROUP_CONCAT(EmailLabelId) FROM emaillabelmst WHERE FIND_IN_SET(LabelId, ?)), ?, FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?) ON DUPLICATE KEY UPDATE SyncStatus = VALUES(SyncStatus), SyncMsgs = VALUES(SyncMsgs), EmailDate = VALUES(EmailDate), EmailFrm = VALUES(EmailFrm), EmailTo = VALUES(EmailTo), EmailCc = VALUES(EmailCc), EmailBcc = VALUES(EmailBcc), EmailSubj = VALUES(EmailSubj), BdyTxt = VALUES(BdyTxt), BdyHtml = VALUES(BdyHtml), HistoryId = VALUES(HistoryId), LabelIds = VALUES(LabelIds), ThreadId = VALUES(ThreadId), MessageID = VALUES(MessageID), InReplyTo = VALUES(InReplyTo), `References` = VALUES(`References`), UpdatedBy = VALUES(UpdatedBy);";

    // qry_ins_emlmsg += "INSERT IGNORE INTO emailmessage (EmailUnqId, EmailAdrsId, EmailDate, EmailFrm, EmailTo, EmailCc, EmailBcc, EmailSubj, BdyTxt, BdyHtml, HistoryId, LabelIds, ThreadId, MessageID, InReplyTo, `References`, IsRecClosed, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES (?, ?, ?, (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), (SELECT GROUP_CONCAT(EmailAddressId) FROM emailaddressmst WHERE FIND_IN_SET(EmailAddress, ?)), FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, (SELECT GROUP_CONCAT(EmailLabelId) FROM emaillabelmst WHERE FIND_IN_SET(LabelId, ?)), ?, FROM_BASE64(?), FROM_BASE64(?), FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);";

    msg.prm_msg.push(msg.unqid, msg.adrid, msg.date, msg.from, msg.toto, msg.cccc, msg.bbcc, base64utf8Encode(msg.Subject), base64utf8Encode(msg.plain), base64utf8Encode(msg.html), msg.hstid, msg.lbll, msg.thdid, base64utf8Encode(msg.MessageID), base64utf8Encode(msg.InReplyTo), base64utf8Encode(msg.References), '0', msg.msg.code, base64utf8Encode(JSON.stringify(msg.msg, null, 2)), msg.usrid, msg.usrid);

    msg.res_msg = await db.execQuery(msg.qry_msg + "" + msg.qry_att, [...msg.prm_msg, ...msg.prm_att]);
    // msg.res_att = await db.execQuery(msg.qry_att, msg.prm_att);
    logerror(msg.msg, `msg.msg ${msg.seqid}`);
  }
  return { status: "success", code: 1, message: "Batch messages processed", success, failed };
}

async function seteml(msg) {
  const tknmsg = await micro_sync(msg.adrid, msg.usrid);
  if ( tknmsg.code == 1 ) {
    Object.assign(msg, await setmsg(tknmsg.token, msg));
    if (msg.frm && msg.frm.length > 0) {
      msg.qry_msg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.frm.map(() => '(?, ?, ?, ?)').join(', ')};`;
      msg.frm.forEach(email => { msg.prm_msg.push(email, '0', msg.usrid, msg.usrid); });
      msg.from = msg.frm.join(',');
    }
    if (msg.to && msg.to.length > 0) { 
      msg.qry_msg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.to.map(() => '(?, ?, ?, ?)').join(', ')};`; 
      msg.to.forEach(email => { msg.prm_msg.push(email, '0', msg.usrid, msg.usrid); }); 
      msg.toto = msg.to.join(','); 
    }
    if (msg.cc && msg.cc.length > 0) { 
      msg.qry_msg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.cc.map(() => '(?, ?, ?, ?)').join(', ')};`; 
      msg.cc.forEach(email => { msg.prm_msg.push(email, '0', msg.usrid, msg.usrid); }); 
      msg.cccc = msg.cc.join(','); 
    }

    if (msg.bcc && msg.bcc.length > 0) { 
      msg.qry_msg += `INSERT IGNORE INTO emailaddressmst (EmailAddress, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.bcc.map(() => '(?, ?, ?, ?)').join(', ')};`; 
      msg.bcc.forEach(email => { msg.prm_msg.push(email, '0', msg.usrid, msg.usrid); }); 
      msg.bbcc = msg.bcc.join(','); 
    }

    if (msg.lblid && msg.lblid.length > 0) { 
      msg.qry_msg += `INSERT IGNORE INTO emaillabelmst (LabelId, IsRecClosed, CreatedBy, UpdatedBy) VALUES ${msg.lblid.map(() => '(?, ?, ?, ?)').join(', ')};`; 
      msg.lblid.forEach(label => { msg.prm_msg.push(label, '0', msg.usrid, msg.usrid); }); 
      msg.lbll = msg.lblid.join(','); 
    }
  } else {
    msg.msg = tknmsg;
  }

  Object.assign(msg, await setatt(msg));

  return msg;
}

async function setmsg(accessObj, msg) {
  try {
    const url = `https://graph.microsoft.com/v1.0/me/messages/${msg.unqid}`;
    const headers = { 'Authorization': `Bearer ${accessObj.access_token}` };
    const rawmsg = await signup.node_fetch(url, "GET", headers);
    msg.msg = { status: "success", code: 1, message: "Success obtaining message." };
    Object.assign(msg, await outlook(rawmsg, msg));
  } catch (oe) {
    try {
      msg.msg = JSON.parse(oe.message);
    } catch {
      msg.msg = { status: "failed", code: 0, message: "Failed obtaining message.", details: { message: oe.message, name: oe.name, stack: oe.stack } };
    }
  }
  return msg;
}

async function outlook(rawmsg, msg) {
  try {
    msg.date = await formatDateAndTime(rawmsg.receivedDateTime) || '2000-01-01T00:00:00Z';
    msg.frm = extractRecipientsArray(rawmsg.from || rawmsg.sender);
    msg.to = extractRecipientsArray(rawmsg.toRecipients);
    msg.cc = extractRecipientsArray(rawmsg.ccRecipients);
    msg.bcc = extractRecipientsArray(rawmsg.bccRecipients);
    msg.Subject = rawmsg.subject || '';
    const contentType = rawmsg.body.contentType || '';
    const content = rawmsg.body.content || '';
    if ( contentType == 'text' ) msg.plain = content;
    if ( contentType == 'html' ) msg.html = content;
    msg.MessageID = rawmsg.internetMessageId || '';
    msg.InReplyTo = rawmsg.inReplyTo || '';
    msg.References = rawmsg.conversationId || '';
    if ( rawmsg.hasAttachments ) {
      if (!msg.att) msg.att = [];
      Object.assign(msg, await docatt(msg));
    }
    msg.msg = { status: "success", code: 1, message: "Success decoding message." };
  } catch (oe) {
    try {
      msg.msg = JSON.parse(oe.message);
    } catch {
      msg.msg = { status: "failed", code: 0, message: "Failed decoding message.", details: { message: oe.message, name: oe.name, stack: oe.stack }, rawmsg: rawmsg };
    }
  }
  return msg;
}

async function formatDateAndTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function extractRecipientsArray(toccbcc) {
    if (toccbcc && toccbcc.emailAddress) return [toccbcc.emailAddress.address];
    if (Array.isArray(toccbcc)) return toccbcc.map(t => (t.emailAddress && t.emailAddress.address) ? t.emailAddress.address : "");
    return [];
}

async function docatt(msg) {
  const tknmsg = await micro_sync(msg.adrid, msg.usrid);
  const url = `https://graph.microsoft.com/v1.0/me/messages/${msg.unqid}/attachments?$select=id,name,size`;
  const headers = { 'Authorization': `Bearer ${tknmsg.token.access_token}` };
  const attachment = await signup.node_fetch(url, "GET", headers);  let att = attachment.value || [];
  // logerror(attachment, `attachment catch ${msg.seqid}`);
  for (let i = 0; i < att.length; i++) {
    msg.att.push({ usrid: msg.usrid, adrid: msg.adrid, unqid: msg.unqid, attid: att[i].id, filename: att[i].name, filedata: '', filesize: att[i].size, qry_att: '', prm_att: [] });
  }
  return msg;
}

async function setatt(msg) {
  if (msg.att && msg.att.length > 0) {
    for (let i = 0; i < msg.att.length; i++) {
      let att = msg.att[i];  att.seqid = i + 1;
      try {
        Object.assign(att, await setdoc(att));
      } catch (oe) {
        try {
          att.att = JSON.parse(oe.message);
        } catch {
          att.att = { status: "error", code: 0, message: "Error Occurred.", details: { message: oe.message, name: oe.name, stack: oe.stack } };
        }
      }
      msg.qry_att += `INSERT IGNORE INTO emailattachment (EmailMessageId, UnqIndx, Attachment, FileName, FileSize, SyncStatus, SyncMsgs, CreatedBy, UpdatedBy) VALUES ((SELECT EmailMsgId FROM emailmessage WHERE EmailAdrsId = ? AND EmailUnqId = ?), ?, FROM_BASE64(?), FROM_BASE64(?), ?, ?, FROM_BASE64(?), ?, ?);`;
      msg.prm_att.push(att.adrid, att.unqid, att.seqid, att.filedata, base64utf8Encode(att.filename), att.filesize, att.att.code, base64utf8Encode(JSON.stringify(att.att, null, 2)), att.usrid, att.usrid);
      // logerror(att.att, `att.att catch ${msg.seqid} ${att.UnqIndx}`);
      msg.att[i] = att;
    }
    msg.doc = { status: "success", code: 1, message: "Yes attachment." };
  } else {
    msg.doc = { status: "failed", code: 0, message: "No attachment." };
  }
  // logerror(msg.doc, `msg.doc ${msg.seqid}`);
  return msg;
}

async function setdoc(att) {
  const tknmsg = await micro_sync(att.adrid, att.usrid);
  if ( tknmsg.code == 1 ) {
    Object.assign(att, await uttachment(tknmsg.token, att));
  } else {
    att.att = tknmsg;
  }
  return att;
}

async function uttachment(accessObj, att) {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${att.unqid}/attachments/${att.attid}`;
  const headers = { 'Authorization': `Bearer ${accessObj.access_token}` };
  const attachment = await signup.node_fetch(url, "GET", headers);
  att.att = { status: "success", code: 1, message: "Success obtaining attachment." };
  att.filedata = attachment.contentBytes;
  return att;
}

export default {
  setemlids,
  batch_setmsg
}