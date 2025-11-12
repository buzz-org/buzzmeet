import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';
import microconn from './microconn.js';

async function micro_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i) {
    let email = await json_micro(hdrlog.frm, hdrlog.to, hdrlog.cc, hdrlog.bcc, hdrlog.subj, hdrlog.body);
    
    const AttachQuery    = arr_temp[0].AttachQuery; let attach = {};

    [attach, hdrlog] = await inline_micro(emltmpl, attach, hdrlog);

    email.body = {
        contentType: "HTML",
        content: Buffer.from(hdrlog.body, "utf-8").toString()
    };

    [attach, hdrlog] = await attach_micro(emltmpl, attach, hdrlog);
    
    if ( AttachQuery != '' ) {
        [attach, hdrlog] = await refer_micro(AttachQuery, attach, hdrlog, pk_id[i]);
    }
    if (attach && attach.length > 0) {
        message.attachments = attach;
    }
    hdrlog.mime = JSON.stringify(email);
    [logmsg, hdrlog] = await micro_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i);

    return [logmsg, hdrlog];
}

async function json_micro(frm, to, cc, bcc, subj, body) {
    const message = {
        subject: subj,
        toRecipients: await createRecipientsArray(to)
    };

    if (cc && cc.length > 0) {
        message.ccRecipients = await createRecipientsArray(cc);
    }

    if (bcc && bcc.length > 0) {
        message.bccRecipients = await createRecipientsArray(bcc);
    }
    return message;
}

async function createRecipientsArray(addresses) {
    const recipients = [];

    for (const address of addresses) {
        recipients.push({
        emailAddress: { address }
        });
    }

    return recipients;
}

async function inline_micro(emltmpl, attach, hdrlog) {
    const query = `SELECT Attachment, Filename FROM emaildocument WHERE TemplateId = ? AND Inline = ?`; const params = [emltmpl, '1'];
    const request = await db.execSql(query, params);  const response = request.result || [];
    hdrlog.attach = hdrlog.attach || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        if (hdrlog.body.includes(fileName)) {
            const cid = `inlineimage${i}`;
            const AttachFile = Buffer.from(Attachment).toString("base64");
            hdrlog.body = hdrlog.body.replace(fileName, `<img src="cid:${cid}">`);
            attach.push({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: fileName,
                contentType: lookup(fileName) || "application/octet-stream",
                contentBytes: AttachFile,
                contentId: cid
            });
            hdrlog.attach.push({
                file: AttachFile,
                filename: fileName,
                inline: 1
            });
        }
    }

    return [attach, hdrlog];
}

async function attach_micro(emltmpl, attach, hdrlog) {
    const query = `SELECT Attachment, Filename FROM emaildocument WHERE TemplateId = ?`; const params = [emltmpl];
    const request = await db.execSql(query, params);  const response = request.result || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        const AttachFile = Buffer.from(Attachment).toString("base64");
        attach.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            contentBytes: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName,
        });
    }
    return [attach, hdrlog];
}

async function refer_micro(AttachQuery, attach, hdrlog, pk_id) {
    const query = `${AttachQuery} ?`; const params = [pk_id];
    const request = await db.execSql(query, params);  const response = request.result || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        const AttachFile = Buffer.from(Attachment).toString("base64");
        attach.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            contentBytes: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName
        });
    }
    return [attach, hdrlog];
}

async function micro_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i) {
    const serproid = arr_temp[0].serproid;
    const serproname = arr_temp[0].serproname;
    const ClientSecret = arr_temp[0].ClientSecret;

    const addresid = arr_temp[0].addresid;
    const addresname = arr_temp[0].addresname;
    const AddressToken = arr_temp[0].AddressToken;

    const clientObj = JSON.parse(ClientSecret || '{}');
    let accessObj = JSON.parse(AddressToken || '{}');

    const clientId = clientObj?.client_id || '';
    const tenantId = clientObj?.tenant_id || '';
    const clientSt = clientObj?.client_secret || '';
    const redirect = clientObj?.redirect_uris || [];
    const auth_uri = clientObj?.auth_uri || '';
    const tokenend = clientObj?.token_end || '';
    const tokenuri = auth_uri + tenantId + tokenend || '';

    const accesstn = accessObj?.access_token || '';
    const refrestn = accessObj?.refresh_token || '';
    const expireat = accessObj?.expires_at || '';

    if (expireat && refrestn && Math.floor(Date.now() / 1000) > expireat) {
        logmsg = await microconn.micro_refresh(arr_temp, usr_login);  accessObj = logmsg.token;
        [logmsg, hdrlog] = await OutlookSend(clientObj, accessObj, logmsg, hdrlog, i);
    } else if (accesstn) {
        [logmsg, hdrlog] = await OutlookSend(clientObj, accessObj, logmsg, hdrlog, i);
    } else {
        logmsg = { status: "failed", code: 0, message: "Error in access token.", accessObj: accessObj };
    }

    return [logmsg, hdrlog];
}

async function OutlookSend(clientObj, accessObj, logmsg, hdrlog, i) {
    const crtdraft = clientObj?.create_draft || '';
    const snddraft = clientObj?.send_draft || '';
    const accesstn = accessObj?.access_token || '';

    const crtbody = hdrlog.mime;

    const headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accesstn
    };

    const crtresp = await signup.node_fetch(crtdraft, "POST", headers, crtbody);

    const sndbody = JSON.stringify({}); const rdydraft = snddraft.replace('{id}', crtresp.id);

    const sndresp = await signup.node_fetch(rdydraft, "POST", headers, sndbody);

    hdrlog = { status: "success", code: 1, message: "Sent successfully.", crtdraft: crtresp, snddraft: sndresp, accessObj: accessObj, clientObj: clientObj };

    return [logmsg, hdrlog];
}

export default {
  micro_fun
};