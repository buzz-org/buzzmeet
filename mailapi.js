// Function implementations
import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import googlsync from './googlsync.js';
import microsync from './microsync.js';
import { logerror } from './buzzapi.js';
import googlconn from './googlconn.js';
import microconn from './microconn.js';

async function mailsignup(data) {
  const query = `SELECT s.SignUpId, s.SignUpPro, s.MailClass FROM signupoptions s;`;  const params = [];
  const response = await db.execQuery(query, params);
  const finalmsg =  { status: "success", code: 1, message: 'signupoptions successfull', mailsignup: response.result || [] };
  return finalmsg;
}

async function mailserpro(data) {
  const query = `SELECT p.EmailSerProId, p.EmailSerProName FROM emailserpromst p WHERE p.IsRecClosed = ?;`;  const params = ['0'];
  const response = await db.execQuery(query, params);
  const finalmsg =  { status: "success", code: 1, message: 'Mailserpro successfull', mailserpro: response.result || [] };
  return finalmsg;
}

async function serprotoken(data) {
  const serproid = data.serproid || '';
  if (!serproid) return { status: "failed", code: 0, message: 'Serproid is required' };
  const query = `SELECT p.EmailSerProId AS serproid, p.EmailSerProName AS serproname, p.ClientSecret FROM emailserpromst p WHERE p.EmailSerProId = ?;`;
  const params = [serproid];
  const response = await db.execQuery(query, params);
  const clientObj = JSON.parse(response?.result?.[0]?.ClientSecret || '{}');
  const action = data.action || '';   let finalmsg; // Declare here
  if (action == 'serprotoken') {
    const clientId = clientObj?.client_id || '';
    const tenantId = clientObj?.tenant_id || '';
    const redirect = clientObj?.redirect_uris || [];
    const auth_uri = clientObj?.auth_uri || '';
    const cliscope = clientObj?.mail_scopes || '';
    finalmsg =  { status: "success", code: 1, message: 'Serprotoken successfull', clientId: clientId, tenantid: tenantId, redirect: redirect, auth_uri: auth_uri, cliscope: cliscope, infotoken: response.result };
  } else {
    finalmsg =  { status: "success", code: 1, message: 'Serprotoken successfull', infotoken: response.result };
  }
  return finalmsg;
}

async function exchangemail(data) {
  const serproid = data.serproid || '';
  if (!serproid) return { status: "failed", code: 0, message: 'Serproid is required' };
  if ( serproid != 5 ) {
    const authCode = data.authCode || '';
    if (!authCode) return { status: "failed", code: 0, message: 'Authcode is required' };
  }
  const clires = await serprotoken(data);  let oauth;
  if ( serproid == 5 ) {
    oauth = await signup.email_token(clires.infotoken, data, db);
  } else if ( serproid == 1 ) {
    oauth = await googlconn.googl_token(clires.infotoken, data, db);
  } else if ( serproid == 2 ) {
    oauth = await microconn.micro_token(clires.infotoken, data, db);
  }
  const finalmsg =  { status: "success", code: 1, message: 'Exchangemail successfull', exchangemail: oauth };
  return finalmsg;
}

async function prefercheck(data) {
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;

  const query = `SELECT DATABASE() AS DB; SELECT a.EmailPrefId, a.EmailPrefName, a.EmailOnOff, a.EmailSync, a.EmailFolder, a.LibraryPath, a.EmailPath, a.EmailLogFile, a.IsRecClosed, a.EmailCurl FROM emailpreference a WHERE a.EmailPrefId = ?;`; const params = ['1'];

  const request = await db.execQuery(query, params);  const response = request.result;
  const arr_daba = response[0]; // object inside first array
  const arr_pref = response[1]; // object inside second array 

  const EmailPrefId   = arr_pref[0].EmailPrefId;
  const EmailPrefName = arr_pref[0].EmailPrefName;
  const EmailOnOff    = arr_pref[0].EmailOnOff;
  const EmailFolder   = arr_pref[0].EmailFolder;
  const LibraryPath   = arr_pref[0].LibraryPath;
  const EmailPath     = arr_pref[0].EmailPath;
  const EmailLogFile  = arr_pref[0].EmailLogFile;
  const EmailSync     = arr_pref[0].EmailSync;
  const EPRClosed     = arr_pref[0].IsRecClosed;
  const EmailCurl     = arr_pref[0].EmailCurl;

  if (arr_pref.length == 0) {
    return { status: "failed", code: 0, message: "Email configuration is empty.", details: "Email configuration is empty.", emlpref: arr_pref };
  } 
  if (EmailOnOff != 1) {
    return { status: "failed", code: 0, message: "Email feature is disabled.", details: "Email feature is disabled.", emlpref: arr_pref };
  } 
  if (EmailSync != 1) {
    return { status: "failed", code: 0, message: "Email syncing is disabled.", details: "Email syncing is disabled.", emlpref: arr_pref };
  } 
  if (EPRClosed != 0) {
    return { status: "failed", code: 0, message: "Email preference is closed.", details: "Email preference is closed.", emlpref: arr_pref };
  } 
  const logmsg = await serprosync(data);
  return logmsg;
}

async function serprosync(data) {
  const action = data.action || '';
  const login_usr = data?.usr_login ?? null;
  const emlid_usr = data?.usr_emlid ?? null;
  const query = `SELECT a.EmailAddressId AS addresid, a.EmailAddress AS addresname, a.AddressToken, a.AllowSync AS addressync, a.IsRecClosed AS addresclose, b.EmailSerProId AS serproid, b.EmailSerProName AS serproname, b.ClientSecret, b.AllowSync AS serprosync, b.IsRecClosed AS serproclose FROM emailaddressmst a INNER JOIN emailserpromst b ON b.EmailSerProId = a.EmailSerProId INNER JOIN emailadrsuser c ON c.EmailAddressId = a.EmailAddressId WHERE a.EmailAddressId = ?;`;
  const params = [emlid_usr];  const request = await db.execQuery(query, params);  const arr_temp = request.result;
  const serproid = arr_temp[0].serproid;
  const serproname = arr_temp[0].serproname;
  const ClientSecret = arr_temp[0].ClientSecret;
  const serprosync = arr_temp[0].serprosync;
  const serproclose = arr_temp[0].serproclose;

  const addresid = arr_temp[0].addresid;
  const addresname = arr_temp[0].addresname;
  const AddressToken = arr_temp[0].AddressToken;
  const addressync = arr_temp[0].addressync;
  const addresclose = arr_temp[0].addresclose;
  if (serprosync != 1) {
    return { status: "failed", code: 0, message: `Email syncing for this ${serproname} is disabled.`, details: `Email sending for this ${serproname} is disabled.` };
  }
  if (serproclose != 0) {
    return { status: "failed", code: 0, message: `Email record of this ${serproname} is closed.`, details: `Email record of this ${serproname} is closed.` };
  }
  if (addressync != 1) {
    return { status: "failed", code: 0, message: `Email syncing for this ${addresname} is disabled.`, details: `Email sending for this ${addresname} is disabled.` };
  }
  if (addresclose != 0) {
    return { status: "failed", code: 0, message: `Email record of this ${addresname} is closed.`, details: `Email record of this ${addresname} is closed.` };
  }
  let logmsg;
  if ( serproid == 1 && action == 'getmsgids' ) {
    logmsg = await googlsync.getemlids(data);
  } else if ( serproid == 2 && action == 'getmsgids' ) {
    logmsg = await microsync.setemlids(data);
  } else if ( serproid == 1 && action == 'batch_getmsg' ) {
    logmsg = await googlsync.batch_getmsg(data);
  } else if ( serproid == 2 && action == 'batch_getmsg' ) {
    logmsg = await microsync.batch_setmsg(data);
  }
  return logmsg;
}

function base64Encode(data) {
  return Buffer.from(data).toString('base64');
}

function base64utf8Encode(data) {
  return Buffer.from(data, 'utf8').toString('base64');
}

export default {
  mailsignup,
  mailserpro,
  serprotoken,
  exchangemail,
  prefercheck,
  serprosync,
  base64Encode,
  base64utf8Encode
};