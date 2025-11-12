import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';

async function smtp_fun(pk_id, usr_login, logmsg, hdrlog, emltmpl, arr_temp, arr_auth, i) {
    let email = await json_smtp(hdrlog.frm, hdrlog.to, hdrlog.cc, hdrlog.bcc, hdrlog.subj, hdrlog.body);
    
    const AttachQuery    = arr_temp[0].AttachQuery; let attach = {};

    [attach, hdrlog] = await inline_smtp(emltmpl, attach, hdrlog);

    email.html = Buffer.from(hdrlog.body, "utf-8").toString();

    [attach, hdrlog] = await attach_smtp(emltmpl, attach, hdrlog);
    
    if ( AttachQuery != '' ) {
        [attach, hdrlog] = await refer_smtp(AttachQuery, attach, hdrlog, pk_id[i]);
    }
    if (attach && attach.length > 0) {
        message.attachments = attach;
    }
    hdrlog.mime = email;
    [logmsg, hdrlog] = await smtp_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i);

    return [logmsg, hdrlog];
}

async function json_smtp(frm, to, cc, bcc, subj, body) {
    const message = {
        from: frm,
        subject: subj,
        to: to
    };

    if (cc && cc.length > 0) {
        message.cc = cc;
    }

    if (bcc && bcc.length > 0) {
        message.bcc = bcc;
    }
    return message;
}

async function inline_smtp(emltmpl, attach, hdrlog) {
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
                filename: fileName,
                contentType: lookup(fileName) || "application/octet-stream",
                encoding: "base64",
                content: AttachFile,
                cid: cid
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

async function attach_smtp(emltmpl, attach, hdrlog) {
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
            filename: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            encoding: "base64",
            content: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName,
        });
    }
    return [attach, hdrlog];
}

async function refer_smtp(AttachQuery, attach, hdrlog, pk_id) {
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
            filename: fileName,
            contentType: lookup(fileName) || "application/octet-stream",
            encoding: "base64",
            content: AttachFile
        });
        hdrlog.attach.push({
            file: AttachFile,
            filename: fileName
        });
    }
    return [attach, hdrlog];
}

async function smtp_send(usr_login, logmsg, hdrlog, arr_temp, arr_auth, i) {
    const HostName = arr_temp[0].HostName;
    const Protocol = arr_temp[0].Protocol;
    const PortNumb = arr_temp[0].PortNumb;
    const addresname = arr_temp[0].addresname;
    const addrespswd = arr_temp[0].addrespswd;

    const nodemailer = await import("nodemailer");
    const { constants } = await import("crypto");

    const transporter = nodemailer.createTransport({
        host: HostName,
        port: PortNumb,
        secure: PortNumb == 465,
        // secure: false, // not SSL
        // requireTLS: true, // STARTTLS
        // secure: true → Use SSL/TLS (usually port 465)
        // secure: false → Use STARTTLS or plain SMTP (usually port 587 or 25)
        // “If the port number is 465, then use SSL (secure: true), otherwise use normal/STARTTLS (secure: false).”
        auth: {
                user: addresname,
                pass: addrespswd,
            },
        // tls: {
        //     minVersion: "TLSv1", // allow older TLS versions
        //     rejectUnauthorized: false, // ignore certificate issues
        //     // allow legacy renegotiation
        //     secureOptions:
        //         constants.SSL_OP_LEGACY_SERVER_CONNECT |
        //         constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
        // },
        logger: true,          // optional (for debugging)
        debug: true
    });

    const sendmail = await transporter.sendMail(hdrlog.mime);

    hdrlog = { status: "success", code: 1, message: "Sent successfully.", sendmail: sendmail };

    return [logmsg, hdrlog];
}

export default {
  smtp_fun
};