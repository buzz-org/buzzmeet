import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';

async function micro_token(infotoken, data, db) {
    const clientdtl = infotoken?.[0].ClientToken || infotoken?.[0].ClientSecret;
    const serproname = infotoken?.[0].serproname || '';
    const clientObj = JSON.parse(clientdtl || '{}');

    const clientId = clientObj?.client_id || '';
    const tenantId = clientObj?.tenant_id || '';
    const clientSt = clientObj?.client_secret || '';
    const redirect = clientObj?.redirect_uris || [];
    const auth_uri = clientObj?.auth_uri || '';
    const oauthend = clientObj?.auth_end || '';
    const oauthuri = auth_uri + tenantId + oauthend || '';
    const tokenend = clientObj?.token_end || '';
    const tokenuri = auth_uri + tenantId + tokenend || '';
    const userinfo = clientObj?.userinfo_uri || '';
    const authscopes = clientObj?.auth_scopes || '';
    const pictureuri = clientObj?.picture_uri || '';

    const authCode = data.authCode || '';
    const signupid = data.signupid || '';
    const serproid = data.serproid || '';
    const usr_login = data.usr_login || '';
    const action = data.action || '';

    const postFields = {
        code: authCode,
        client_id: clientId,
        client_secret: clientSt,
        redirect_uri: redirect[0],
        grant_type: 'authorization_code',
        scope: authscopes
    };

    const request = await signup.node_fetch(tokenuri, "POST", { 'Content-Type': 'application/x-www-form-urlencoded' }, new URLSearchParams(postFields));

    const accessToken = request.access_token;

    const resp = await fetch(userinfo, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = await resp.json(); // const url = user.picture;

    const picture = await fetch(pictureuri, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const httpCode = picture.status;
    const contentType = picture.headers.get("content-type");
    const buffer = await picture.arrayBuffer();

    const extension = (() => {
      switch (contentType) {
        case "image/jpeg": return "jpg";
        case "image/png": return "png";
        case "image/gif": return "gif";
        default: return "bin";
      }
    })();

    const filename = `unnamed.${extension}`;

    user.image = Buffer.from(buffer).toString("base64"); user.filename = filename; let finalmsg;

    request.created = Math.floor(Date.now() / 1000);
    request.generated = new Date(request.created * 1000).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "");
    request.expires_in = 3600; // Set manually or from API
    request.expires_at = request.created + request.expires_in;
    request.validtill = new Date(request.expires_at * 1000).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "");
    request.TOKEN_ENDPOINT = tokenuri;
    request.AUTH_ENDPOINT = oauthuri;
    // data.AUTH_URL = oauthurl;
    request.redirect_uris = redirect;
    request.serproid = serproid || signupid;
    request.serproname = serproname;
    request.addresname = user.email;

    if (action == 'exchangeauth') {
        finalmsg = { status: "success", code: 1, message: "O-Authorized successfully.", details: "O-Authorized", EmailId: user.mail, SignUpId: signupid, Oauth: authCode, Token: request, Info: user, picture: user.image, filename: user.filename };
        user.oauthotpid = await signup.insert_oauth(finalmsg);
    } else {
        finalmsg = { status: "success", code: 1, message: "E-Authorized successfully.", token: request, addresname: user.mail, details: "E-Authorized", serproid: serproid, usr_login: usr_login };
        user.addresid = await signup.insert_token(finalmsg);
    }
    return user;
}

async function micro_refresh(arr_temp, usr_login) {
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
    const cliscope = clientObj?.mail_scopes || '';
    const usrscope = clientObj?.user_scopes || '';
    const redirect = clientObj?.redirect_uris || [];
    const auth_uri = clientObj?.auth_uri || '';
    const oauthend = clientObj?.auth_end || '';
    const oauthuri = auth_uri + tenantId + oauthend || '';
    const tokenend = clientObj?.token_end || '';
    const tokenuri = auth_uri + tenantId + tokenend || '';

    const refrestn = accessObj?.refresh_token || '';

    const postFields = {
        client_id: clientId,
        client_secret: clientSt,
        scope: usrscope,
        refresh_token: refrestn,
        grant_type: 'refresh_token'
    };

    const data = await signup.node_fetch(tokenuri, "POST", { "Content-Type": "application/x-www-form-urlencoded" }, new URLSearchParams(postFields));

    const queryParams = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirect,
        response_mode: "query",
        scope: usrscope
    });
    const oauthurl = `${oauthuri}?${queryParams.toString()}`;

    data.created = Math.floor(Date.now() / 1000);
    data.generated = new Date(data.created * 1000).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "");
    data.expires_in = 3600; // Set manually or from API
    data.expires_at = data.created + data.expires_in;
    data.validtill = new Date(data.expires_at * 1000).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "");
    data.TOKEN_ENDPOINT = tokenuri;
    data.AUTH_ENDPOINT = oauthuri;
    data.AUTH_URL = oauthurl;
    data.redirect_uris = redirect;
    data.refresh_token = refrestn;
    data.serproid = serproid;
    data.serproname = serproname;
    data.addresid = addresid;
    data.addresname = addresname;

    let logmsg = { status: "success", code: 1, message: "Refreshed successfully.", token: data, addresname: addresname, details: "Refreshed", serproid: serproid, usr_login: usr_login };

    logmsg.addresid = await signup.insert_token(logmsg);

    return [logmsg, data];
}

export default {
  micro_token,
  micro_refresh
};