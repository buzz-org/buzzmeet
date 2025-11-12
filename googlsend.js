import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';
import googlconn from './googlconn.js';

async function googl_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i) {
    
    let email = await mime_googl(hdrlog.frm, hdrlog.to, hdrlog.cc, hdrlog.bcc, hdrlog.subj, hdrlog.body);

    [email, hdrlog] = await inline_googl(emltmpl, email, hdrlog);
    [email, hdrlog] = await attach_googl(emltmpl, email, hdrlog);
    
    const AttachQuery    = arr_temp[0].AttachQuery;

    if ( AttachQuery != '' ) {
        [email, hdrlog] = await refer_googl(AttachQuery, email, hdrlog, pk_id[i]);
    }
    hdrlog.mime = email.asRaw();
    [logmsg, hdrlog] = await googl_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i);

    return [logmsg, hdrlog];
}

async function mime_googl(frm, to, cc, bcc, subj, body) {
    const { createMimeMessage } = await import("mimetext");

    const msg = createMimeMessage();
    msg.setSender(frm);
    msg.setRecipient(to);
    if (cc && cc.length > 0) {
        msg.setCc(cc);
    }
    if (bcc && bcc.length > 0) {
        msg.setBcc(bcc);
    }
    msg.setSubject(subj);
    // msg.addMessage({ contentType: "text/plain", data: "Plain text content" });
    // msg.addMessage({ contentType: "text/html", data: "<p>HTML version</p>" });
    return msg;
}

async function inline_googl(emltmpl, email, hdrlog) {
    const query = `SELECT Attachment, Filename FROM emaildocument WHERE TemplateId = ? AND Inline = ?`; const params = [emltmpl, '1'];
    const request = await db.execSql(query, params);  const response = request.result || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;
    hdrlog.attach = hdrlog.attach || [];

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        if (hdrlog.body.includes(fileName)) {
            const cid = `inlineimage${i}`;
            const AttachFile = Buffer.from(Attachment).toString("base64");
            hdrlog.body = hdrlog.body.replace(fileName, `<img src="cid:${cid}">`);
            email.addAttachment({
                filename: fileName,
                contentType: lookup(fileName) || "application/octet-stream",
                data: AttachFile, 
                inline: true,
                cid: cid,
            });
            hdrlog.attach.push({
                file: AttachFile,
                filename: fileName,
                inline: 1
            });
        }
    }
    email.addMessage({
        contentType: "text/html",
        data: hdrlog.body,
    });
    return [email, hdrlog];
}

async function attach_googl(emltmpl, email, hdrlog) {
    const query = `SELECT Attachment, Filename FROM emaildocument WHERE TemplateId = ?`; const params = [emltmpl];
    const request = await db.execSql(query, params);  const response = request.result || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        const AttachFile = Buffer.from(Attachment).toString("base64");
        email.addAttachment({
            filename: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            data: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName
        });
    }
    return [email, hdrlog];
}

async function refer_googl(AttachQuery, email, hdrlog, pk_id) {
    const query = `${AttachQuery} ?`; const params = [pk_id];
    const request = await db.execSql(query, params);  const response = request.result || [];

    const { default: mime } = await import("mime-types");
    const { lookup } = mime;

    for (let i = 0; i < response.length; i++) {
        const row = response[i];
        const Attachment = row[0] ?? row.Attachment;
        const fileName = row[1] ?? row.Filename;
        const AttachFile = Buffer.from(Attachment).toString("base64");
        email.addAttachment({
            filename: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            data: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName
        });
    }
    return [email, hdrlog];
}

async function googl_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i) {
    const serproid = arr_temp[0].serproid;
    const serproname = arr_temp[0].serproname;
    const ClientSecret = arr_temp[0].ClientSecret;

    const addresid = arr_temp[0].addresid;
    const addresname = arr_temp[0].addresname;
    const AddressToken = arr_temp[0].AddressToken;

    const clientObj = JSON.parse(ClientSecret || '{}');
    let accessObj = JSON.parse(AddressToken || '{}');

    const clientId = clientObj?.client_id || '';
    const clientSt = clientObj?.client_secret || '';
    const redirect = clientObj?.redirect_uris || [];
    const tokenuri = clientObj?.token_uri || '';

    const accesstn = accessObj?.access_token || '';
    const refrestn = accessObj?.refresh_token || '';
    const expireat = accessObj?.expires_at || '';

    if (expireat && refrestn && Math.floor(Date.now() / 1000) > expireat) {
        logmsg = await googlconn.googl_refresh(arr_temp, usr_login);  accessObj = logmsg.token;
        [logmsg, hdrlog] = await GmailSend(clientObj, accessObj, logmsg, hdrlog, i);
    } else if (accesstn) {
        [logmsg, hdrlog] = await GmailSend(clientObj, accessObj, logmsg, hdrlog, i);
    } else {
        logmsg = { status: "failed", code: 0, message: "Error in access token.", accessObj: accessObj };
    }

    return [logmsg, hdrlog];
}

async function GmailSend(clientObj, accessObj, logmsg, hdrlog, i) {
    const crtdraft = clientObj?.create_draft || '';
    const snddraft = clientObj?.send_draft || '';
    const accesstn = accessObj?.access_token || '';

    const crtbody = JSON.stringify({
        message: {
            raw: Buffer.from(hdrlog.mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        }
    });

    const headers = {
        "Content-Type": "message/cpim",
        "Authorization": "Bearer " + accesstn
    };

    const crtresp = await signup.node_fetch(crtdraft, "POST", headers, crtbody);

    const sndbody = JSON.stringify({
        id: crtresp.id
    });

    const sndresp = await signup.node_fetch(snddraft, "POST", headers, sndbody);

    hdrlog = { status: "success", code: 1, message: "Sent successfully.", crtdraft: crtresp, snddraft: sndresp, accessObj: accessObj, clientObj: clientObj };

    return [logmsg, hdrlog];
}

export default {
  googl_fun
};