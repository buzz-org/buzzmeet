import { createRequire } from "module";
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';
import db from './Database.js';
// import validator from "validator";
import googlsend from './googlsend.js';
import microsend from './microsend.js';
import smtpsend from './smtpsend.js';
import googlconn from './googlconn.js';
import microconn from './microconn.js';

const validator = require("validator");

async function chatsignup(data, db) {
    
    const query = `SELECT s.SignUpId, s.SignUpPro, s.ChatClass FROM signupoptions s;`;
    const params = [];

    const response = await db.execQuery(query, params);

    const finalmsg =  { status: "success", code: 1, message: 'Chatsignup successfull', chatsignup: response.result || [] };

    return finalmsg;
}

async function signuptoken(data, db) {
    const signupid = data.signupid || '';
    if (!signupid) return { status: "failed", code: 0, message: 'Signupid is required' };
    const query = `SELECT s.EmailSerProId AS serproid, s.EmailSerProName AS serproname, s.ClientToken FROM signupoptions s WHERE s.SignUpId = ?;`;
    const params = [signupid];
    const response = await db.execQuery(query, params);
    const clientObj = JSON.parse(response?.result?.[0]?.ClientToken || '{}');
    const action = data.action || '';   let finalmsg; // Declare here
    if (action == 'signuptoken') {
        const clientId = clientObj?.client_id || '';
        const tenantId = clientObj?.tenant_id || '';
        const redirect = clientObj?.redirect_uris || [];
        finalmsg =  { status: "success", code: 1, message: 'Signuptoken successfull', clientid: clientId, tenantid: tenantId, redirect: redirect };
    } else {
        finalmsg =  { status: "success", code: 1, message: 'Signuptoken successfull', infotoken: response.result };
    }
    return finalmsg;
}

async function exchangeauth(data, db) {
    const signupid = data.signupid || '';
    if (!signupid) return { status: "failed", code: 0, message: 'Signupid is required' };

    if ( signupid != 1 ) {
        const authCode = data.authCode || '';
        if (!authCode) return { status: "failed", code: 0, message: 'Authcode is required' };
    }
    const clires = await signuptoken(data, db);  let oauth;

    if ( signupid == 1 ) {
        oauth = await email_token(clires.infotoken, data, db);
    } else if ( signupid == 2 ) {
        oauth = await googl_token(clires.infotoken, data, db);
    } else if ( signupid == 3 ) {
        oauth = await micro_token(clires.infotoken, data, db);
    }

    const finalmsg =  { status: "success", code: 1, message: 'Exchangeauth successfull', exchangeauth: oauth };

    return finalmsg;
}

async function insert_oauth(logmsg) {
    const InfoBase64 = Buffer.from(JSON.stringify(logmsg.Info, null, 2)).toString("base64");
    const query = `INSERT INTO signupauthotp (EmailId, SignUpId, Oauth, Token, Info, picture, filename) VALUES (?, ?, ?, ?, FROM_BASE64(?), FROM_BASE64(?), ?);`;
    const params = [logmsg.EmailId, logmsg.SignUpId, logmsg.Oauth, logmsg.Token, InfoBase64, logmsg.picture, logmsg.filename];
    const request = await db.execQuery(query, params);  const response = request.result;
    return response.insertId;
}

async function insert_token(logmsg) {
    const tokenBase64 = Buffer.from(JSON.stringify(logmsg.token, null, 2)).toString("base64");
    const logmsgBase64 = Buffer.from(JSON.stringify(logmsg, null, 2)).toString("base64");
    const query = 'INSERT INTO emailaddressmst (EmailAddress, AddressToken, EmailSerProId, AllowConn, AllowSend, AllowSync, IsRecClosed, CreatedBy, UpdatedBy) VALUES (?, FROM_BASE64(?), ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE AddressToken = VALUES(AddressToken), UpdatedBy = VALUES(UpdatedBy); INSERT INTO emailloghd (LogType, EmailAddressId, SendStatus, SendMsgs, CreatedBy) VALUES (?, (SELECT EmailAddressId FROM emailaddressmst a WHERE a.EmailAddress = ?), ?, FROM_BASE64(?), ?);';
    const params = [logmsg.addresname, tokenBase64, logmsg.serproid, '1', '1', '1', '0', logmsg.usr_login, logmsg.usr_login, 
        '1', logmsg.addresname, logmsg.code, logmsgBase64, logmsg.usr_login ];
    const request = await db.execQuery(query, params);  const response = request.result;
    return response[0].insertId;
}

async function email_token(clientdtl, data, db) {
    const emailId = data.emailId || '';
    if (!emailId) return { status: "failed", code: 0, message: 'Emailid is required.' };

    const signupid = data.signupid || '';
    const otp = await generateOtp(6); 
    const timestamp = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');

    const query = `SELECT TemplateId FROM user_prefs WHERE PrefId = ?; INSERT INTO signupauthotp (EmailId, Otp, GeneratedDtTm, SignUpId) VALUES (?, ?, ?, ?);`;
    const params = ['1', emailId, otp.otp, timestamp, signupid];

    const request = await db.execQuery(query, params);  const response = request.result;

    const dns = await import('dns');

    const hasInternet = await new Promise((resolve) => {
        dns.lookup('google.com', (err) => {
        resolve(!err);
        });
    });

    if (!hasInternet) {
        return { status: "failed", code: 0, message: `No internet connection to send email, Your OTP is ${otp.otp} and is valid for 15 minutes.`, result: response, otp: otp };
    } else {
        const [emlotp, emltmp] = await email_send([response[1].insertId], otp.otp, db, response[0][0].TemplateId);
        return { status: "success", code: 1, message: 'Internet connection is available.', result: response, otp: otp, emlotp: emlotp, emltmp: emltmp };
    }
}

async function generateOtp(length) {
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10); // generates a digit from 0–9
    }

    return { status: "success", code: 1, message: "Otp generated successfully.", otp: otp
    };
}

async function email_send(pk_id, usr_login, db, emltmpl) {
    const query = `SELECT DATABASE() AS DB; SELECT a.EmailPrefId, a.EmailPrefName, a.EmailOnOff, a.EmailSend, a.EmailFolder, a.LibraryPath, a.EmailPath, a.EmailLogFile, a.IsRecClosed, a.EmailCurl FROM emailpreference a WHERE a.EmailPrefId = ?; INSERT INTO emailloghd (LogType, CreatedBy) VALUES (?, ?)`; const params = ['1', '2', usr_login];

    const request = await db.execQuery(query, params);  const response = request.result;
    let logmsg = { status: "success", code: 1, message: "Starting trouble.", details: "Not going forward." };
    let hdrlog = { status: "success", code: 1, message: "Starting trouble.", details: "Not going forward." };

    const arr_db = response[0]; // object inside first array
    const arr_pref = response[1]; // object inside second array 
    const daba = arr_pref[0].DB = arr_db.DB
    const arr_lid = response[2];    // last plain object
    const lid = arr_lid.insertId;

    if (pk_id && usr_login) {
        [logmsg, hdrlog] = await pref_check(pk_id, usr_login, arr_pref, logmsg, hdrlog, emltmpl);
        // logmsg = { status: "failed", code: 0, message: "primary key or username not set.", details: "Either primary key or username not set." };
    } else {
        logmsg = { status: "success", code: 1, message: "primary key or username is set.", details: "Both primary key and username is set." };

    }
    return [logmsg, hdrlog];
}

async function pref_check(pk_id, usr_login, arr_pref, logmsg, hdrlog, emltmpl) {
    const EmailPrefId   = arr_pref[0].EmailPrefId;
    const EmailPrefName = arr_pref[0].EmailPrefName;
    const EmailOnOff    = arr_pref[0].EmailOnOff;
    const EmailFolder   = arr_pref[0].EmailFolder;
    const LibraryPath   = arr_pref[0].LibraryPath;
    const EmailPath     = arr_pref[0].EmailPath;
    const EmailLogFile  = arr_pref[0].EmailLogFile;
    const EmailSend     = arr_pref[0].EmailSend;
    const EPRClosed     = arr_pref[0].IsRecClosed;
    const EmailCurl     = arr_pref[0].EmailCurl;

    if (arr_pref.length == 0) {
        logmsg = { status: "failed", code: 0, message: "Email configuration is empty.", details: "Email configuration is empty.", emlpref: arr_pref };
    } else if (EmailOnOff != 1) {
        logmsg = { status: "failed", code: 0, message: "Email feature is disabled.", details: "Email feature is disabled.", emlpref: arr_pref };
    } else if (EmailSend != 1) {
        logmsg = { status: "failed", code: 0, message: "Email sending is disabled.", details: "Email sending is disabled.", emlpref: arr_pref };
    } else if (EPRClosed != 0) {
        logmsg = { status: "failed", code: 0, message: "Email preference is closed.", details: "Email preference is closed.", emlpref: arr_pref };
    } else {
        const query = "SET SESSION group_concat_max_len = 1000000;";    const params = [];
        const request = await db.execQuery(query, params);  const response = request.result;
        [logmsg, hdrlog] = await temp_check(pk_id, usr_login, logmsg, hdrlog, emltmpl);
        // logmsg = { status: "success", code: 1, message: "All email preferences are okay.", details: "All email preferences are okay.", setsess: response };
    }

    return [logmsg, hdrlog];
}

async function temp_check(pk_id, usr_login, logmsg, hdrlog, emltmpl) {
    const dq = '"'; const df = "%d-%m-%Y";

    const query = `SELECT a.TemplateId, a.TemplateDesc, a.DbName, a.TbName, a.PkClName, a.VariableName, a.FrmFlag, a.TmpFrm, a.RefFrm, a.ToFlag, a.ManTo, a.ManCc, a.ManBcc, a.SubjFlag, a.TmpSubj, a.RefSubj, a.BodyFlag, a.TmpBody, a.RefBody, a.IsRecClosed

    , CONCAT('a.',a.PkClName) AS PKColumn, (SELECT GROUP_CONCAT(b.email) FROM sec_users b WHERE FIND_IN_SET(b.login, a.SecTo)) AS SecTo, (SELECT GROUP_CONCAT(c.email) FROM sec_users c WHERE FIND_IN_SET(c.login, a.SecCc)) AS SecCc, (SELECT GROUP_CONCAT(d.email) FROM sec_users d WHERE FIND_IN_SET(d.login, a.SecBcc)) AS SecBcc

    , CONCAT((case when (a.RefTo != '') then ((SELECT GROUP_CONCAT(case when (e.RefClVlName !='' AND e.RefClName !='' AND e.RefTbName !='' AND e.RefDbName !='') then CONCAT('(SELECT ',e.RefTbName,'.',e.RefClVlName,' FROM ',e.RefDbName,'.',e.RefTbName,' WHERE ',e.RefTbName,'.',e.RefClName,' = a.',e.ClName,') AS ',e.RefClVlName)ELSE CONCAT('a.',e.ClName) END) FROM emailvariable e WHERE e.DbName = a.DbName AND e.TbName = a.TbName AND e.VariableName = a.RefTo)) ELSE CONCAT('('''') AS RefTo') END), ', ', (case when (a.RefCc != '') then ((SELECT GROUP_CONCAT(case when (e.RefClVlName !='' AND e.RefClName !='' AND e.RefTbName !='' AND e.RefDbName !='') then CONCAT('(SELECT GROUP_CONCAT(',e.RefTbName,'.',e.RefClVlName,') FROM ',e.RefDbName,'.',e.RefTbName,' WHERE FIND_IN_SET( ',e.RefTbName,'.',e.RefClName,' , a.',e.ClName,' )) AS ',e.ClName)ELSE CONCAT('a.',e.ClName) END) FROM emailvariable e WHERE e.DbName = a.DbName AND e.TbName = a.TbName AND e.VariableName = a.RefCc)) ELSE CONCAT('('''') AS RefCc') END), ', ', (case when (a.RefBcc != '') then ((SELECT GROUP_CONCAT(case when (e.RefClVlName !='' AND e.RefClName !='' AND e.RefTbName !='' AND e.RefDbName !='') then CONCAT('(SELECT GROUP_CONCAT(',e.RefTbName,'.',e.RefClVlName,') FROM ',e.RefDbName,'.',e.RefTbName,' WHERE FIND_IN_SET( ',e.RefTbName,'.',e.RefClName,' , a.',e.ClName,' )) AS ',e.ClName)ELSE CONCAT('a.',e.ClName) END) FROM emailvariable e WHERE e.DbName = a.DbName AND e.TbName = a.TbName AND e.VariableName = a.RefBcc)) ELSE CONCAT('('''') AS RefBcc') END)) AS RefToCcBcc

    , (SELECT COALESCE(CONCAT(', ', GROUP_CONCAT(case when (n.RefClVlName !='' AND n.RefClName !='' AND n.RefTbName !='' AND n.RefDbName !='') then CONCAT('(SELECT GROUP_CONCAT(',n.RefTbName,'.',n.RefClVlName,') FROM ',n.RefDbName,'.',n.RefTbName,' WHERE FIND_IN_SET( ',n.RefTbName,'.',n.RefClName,' , a.',n.ClName,' )) AS ',n.RefClVlName) when (n.DtName = 'date') then CONCAT('DATE_FORMAT(a.',n.ClName,',','".$dq."".$df."".$dq."',') AS ', n.ClName) ELSE CONCAT('a.',n.ClName) END SEPARATOR ', ')), '') FROM emailvariable n WHERE n.DbName = a.DbName AND n.TbName = a.TbName AND FIND_IN_SET(n.VariableName, a.VariableName)) AS ColumnList

    , (case when (a.AttTb !='' AND a.AttDt !='' AND a.AttFl !='' AND a.AttFk !='') then (CONCAT('SELECT ', a.AttDt, ', ', a.AttFl,' FROM ', a.DbName, '.', a.AttTb, ' WHERE ', a.AttFk, ' = ')) ELSE '' END) AS AttachQuery

    , q.EmailSerProId AS serproid, q.EmailSerProName AS serproname, q.ClientSecret, p.AllowSend AS serprosend, q.IsRecClosed AS serproclose, q.HostName, q.Protocol, q.PortNumb

    , p.EmailAddressId AS addresid, p.EmailAddress AS addresname, p.EmailPassword as addrespswd, p.AddressToken, q.AllowSend AS addressend, p.IsRecClosed AS addresclose, name AS addresmail

	FROM emailtemplate a INNER JOIN emailaddressmst p ON p.EmailAddressId = a.TmpFrm INNER JOIN emailserpromst q ON q.EmailSerProId = p.EmailSerProId INNER JOIN emailpreference m ON m.EmailPrefId = q.EmailPrefId WHERE a.TemplateId = ?`;   const params = [emltmpl];

    const request = await db.execQuery(query, params);  const response = request.result;

    const arr_temp = response;

    const serproid = arr_temp[0].serproid;
    const serproname = arr_temp[0].serproname;
    const ClientSecret = arr_temp[0].ClientSecret;
    const serprosend = arr_temp[0].serprosend;
    const serproclose = arr_temp[0].serproclose;

    const addresid = arr_temp[0].addresid;
    const addresname = arr_temp[0].addresname;
    const AddressToken = arr_temp[0].AddressToken;
    const addressend = arr_temp[0].addressend;
    const addresclose = arr_temp[0].addresclose;

    const TemplateId = arr_temp[0].TemplateId;
    const TemplateDesc = arr_temp[0].TemplateDesc;
    const IsRecClosed = arr_temp[0].addresclose;

    if (arr_temp.length == 0) {
        logmsg = { status: "failed", code: 0, message: "No template.", details: "No data." };
    } else if (serprosend != 1) {
        logmsg = { status: "failed", code: 0, message: `Email sending for this ${serproname} is disabled.`, details: `Email sending for this ${serproname} is disabled.` };
    } else if (serproclose != 0) {
        logmsg = { status: "failed", code: 0, message: `Email record of this ${serproname} is closed.`, details: `Email record of this ${serproname} is closed.` };
    } else if (addressend != 1) {
    logmsg = { status: "failed", code: 0, message: `Email sending for this ${addresname} is disabled.`, details: `Email sending for this ${addresname} is disabled.` };
    } else if (addresclose != 0) {
        logmsg = { status: "failed", code: 0, message: `Email record of this ${addresname} is closed.`, details: `Email record of this ${addresname} is closed.` };
    } else if (IsRecClosed != 0) {
        logmsg = { status: "failed", code: 0, message: `Template record of this ${TemplateDesc} is closed.`, details: `Template record of this ${TemplateDesc} is closed.` };
    } else {
        [logmsg, hdrlog] = await list_check(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp);
        // logmsg = { status: "success", code: 1, message: "All email preferences are okay.", details: "All email preferences are okay.", setsess: response };
    }
    return [logmsg, hdrlog];
}

async function list_check(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp) {
    const serproid      = arr_temp[0].serproid;
    const serproname    = arr_temp[0].serproname;
    const ClientSecret  = arr_temp[0].ClientSecret;
    const serprosend    = arr_temp[0].serprosend;
    const serproclose   = arr_temp[0].serproclose;

    const addresid      = arr_temp[0].addresid;
    const addresname    = arr_temp[0].addresname;
    const AddressToken  = arr_temp[0].AddressToken;
    const addressend    = arr_temp[0].addressend;
    const addresclose   = arr_temp[0].addresclose;

    const TemplateId    = arr_temp[0].TemplateId;
    const TemplateDesc  = arr_temp[0].TemplateDesc;
    const IsRecClosed   = arr_temp[0].addresclose;

    const tempdb        = arr_temp[0].DbName;
	const temptb		= arr_temp[0].TbName;
    const temppk		= arr_temp[0].PkClName;
    const pkclmn		= arr_temp[0].PKColumn;

    const RefToCcBcc    = arr_temp[0].RefToCcBcc;
    const ColumnList    = arr_temp[0].ColumnList;

    let query, params = [], arr_auth = [];

    for (let i = 0; i < pk_id.length; i++) {
        query = `SELECT ${pkclmn}, ${RefToCcBcc} ${ColumnList} FROM ${tempdb}.${temptb} a WHERE ${pkclmn} = ?`;   params = [pk_id[i]];
        const request = await db.execSql(query, params);  const response = request.result;  arr_auth = response[0];
        [logmsg, hdrlog] = await srpr_check(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, response, i);
        // logmsg = { status: "success", code: 1, message: "All email preferences are okay.", details: "All email preferences are okay.", query: response };
    }

    return [logmsg, hdrlog];
}

async function srpr_check(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i) {
    const serproid      = arr_temp[0].serproid;
    [logmsg, hdrlog] = await prepare(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i);
    if ( serproid == 1 ) {
        [logmsg, hdrlog] = await googlsend.googl_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i);
    } else if ( serproid == 2 ) {
        [logmsg, hdrlog] = await microsend.micro_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i);
    } else if ( serproid == 5 || serproid == 6 ) {
        [logmsg, hdrlog] = await smtpsend.smtp_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i);
    } else {
        hdrlog = { status: "failed", code: 0, message: `Invalid Account.`, details: `Email integration for this account does not exist.` };
    }
    logmsg = { status: "success", code: 1, message: "Sent successfully.", details: "All okay.", srpr_check: "srpr_check" };
    // hdrlog = { status: "success", code: 1, message: "Prepare successfully.", details: "All okay.", frmid: addresid, frm: addresname, to: ValTo, cc: ValCc, bcc : ValBcc, subj: ValSubj, body: ValBody };
    return [logmsg, hdrlog];
}

async function prepare(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i) {
    const FrmFlag       = arr_temp[0].FrmFlag;

    const addresid = arr_temp[0].addresid;
    const addresname = arr_temp[0].addresname;
    
    const SubjFlag		= arr_temp[0].SubjFlag;
    const TmpSubj		= arr_temp[0].TmpSubj;
    const BodyFlag		= arr_temp[0].BodyFlag;
    const TmpBody		= arr_temp[0].TmpBody;

    const EmlSubj = (SubjFlag == 2) ? arr_auth[i][10] : TmpSubj;
    const EmlBody = (BodyFlag == 2) ? arr_auth[i][11] : TmpBody;

    const gbl_vr		= arr_temp[0].VariableName;
    const gbl_hd = gbl_vr.split(',');
    let ValSubj, ValBody;

    const [ValTo, InvTo, ValCc, InvCc, ValBcc, InvBcc] = await emltoccbcc(arr_temp, arr_auth[i]);
    [ValSubj, ValBody] = await man_rep_hd(emltmpl, EmlSubj, EmlBody, pk_id[i]);
    [ValSubj, ValBody] = await aut_rep_hd(gbl_hd, arr_auth[i], ValSubj, ValBody);

    // logmsg = { status: "success", code: 1, message: "Sent successfully.", details: "All okay.", gbl_hd: gbl_hd };
    hdrlog = { status: "success", code: 1, message: "Prepare successfully.", details: "All okay.", frmid: addresid, frm: addresname, to: ValTo, cc: ValCc, bcc : ValBcc, subj: ValSubj, body: ValBody };

    return [logmsg, hdrlog];
}

async function emltoccbcc(arr_temp, arr_auth) {
	const ToFlag		= arr_temp[0].ToFlag;

    const SecTo		= arr_temp[0].SecTo;
    const SecCc		= arr_temp[0].SecCc;
    const SecBcc	= arr_temp[0].SecBcc;

    const ManTo		= arr_temp[0].ManTo;
    const ManCc		= arr_temp[0].ManCc;
    const ManBcc	= arr_temp[0].ManBcc;

    let ValTo, InvTo, ValCc, InvCc, ValBcc, InvBcc;
    
    if ( ToFlag == 1 ) {
        [ValTo, InvTo]   = await valtoccbcc(SecTo);
    } else if ( ToFlag == 2 ) {
        [ValTo, InvTo]   = await valtoccbcc(arr_auth[1]);
    } else if ( ToFlag == 3 ) {
        [ValTo, InvTo]   = await valtoccbcc(ManTo);
    }

    [ValCc, InvCc] = await valtoccbcc(`${SecCc},${arr_auth[2]},${ManCc}`);
    [ValBcc, InvBcc] = await valtoccbcc(`${SecBcc},${arr_auth[3]},${ManBcc}`);

    return [ValTo, InvTo, ValCc, InvCc, ValBcc, InvBcc];
}

async function valtoccbcc(emls) {
    const valid = [];
    const invalid = [];

    if (emls && emls.trim() !== '') {
        const arr_emls = emls.split(',').map(e => e.trim());
        for (const email of arr_emls) {
            if (validator.isEmail(email)) {
                valid.push(email);
            } else {
                invalid.push(email);
            }
        }
    }

    return [valid, invalid];
}

async function man_rep_hd(emltmpl, EmlSubj, EmlBody, pk_id) {
    return [EmlSubj, EmlBody];
}

async function aut_rep_hd(gbl_hd, arr_ter, EmlSubj, EmlBody) {
    for (let i = 0; i < gbl_hd.length; i++) {
        const k = i + 4;
        EmlSubj = EmlSubj.replaceAll(gbl_hd[i], arr_ter[k]);
        EmlBody = EmlBody.replaceAll(gbl_hd[i], arr_ter[k]);
    }
    return [EmlSubj, EmlBody];
}

async function node_fetch(url, method, headers, body) {
    const options = {
        method,
        headers,
    };
    // Only include body if it's NOT a GET or HEAD request
    if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
        options.body = body;
    }
    const response = await fetch(url, options);
    const text = await response.text();
    let data;   console.log(text);
    try { data = JSON.parse(text); } catch { data = text; }
    return data;
}

async function getCurrentUrl(req) {
  const protocol = req.headers['x-forwarded-proto']
    ? `${req.headers['x-forwarded-proto']}://`
    : req.secure
      ? 'https://'
      : 'http://';

  const host = req.headers.host;
  const requestUri = req.originalUrl.split('?')[0];

  return protocol + host + requestUri;
}

export default {
    chatsignup,
    signuptoken,
    exchangeauth,
    getCurrentUrl,
    email_token,
    node_fetch,
    insert_oauth,
    insert_token
}