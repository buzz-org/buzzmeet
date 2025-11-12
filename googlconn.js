import fs from 'fs';
import path from 'path';
import db from './Database.js';
import signup from './signup.js';
import { logerror } from './buzzapi.js';

async function googl_token(infotoken, data, db) {
    const clientdtl = infotoken?.[0].ClientToken || infotoken?.[0].ClientSecret;
    const serproname = infotoken?.[0].serproname || '';
    const clientObj = JSON.parse(clientdtl || '{}');

    const clientId = clientObj?.client_id || '';
    const clientSt = clientObj?.client_secret || '';
    const redirect = clientObj?.redirect_uris || [];
    const tokenuri = clientObj?.token_uri || '';
    const userinfo = clientObj?.userinfo_uri || '';
    const oauthuri = clientObj?.auth_uri || '';

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
        grant_type: 'authorization_code'
    };

    const request = await signup.node_fetch(tokenuri, "POST", { 'Content-Type': 'application/x-www-form-urlencoded' }, new URLSearchParams(postFields));

    const accessToken = request.access_token;

    const resp = await fetch(userinfo, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = await resp.json(); const url = user.picture;

    const picture = await fetch(url, {
      method: "GET",
      redirect: "follow",
      // If HTTPS issues, uncomment below (for self-signed certs)
      // agent: new (await import("https")).Agent({ rejectUnauthorized: false })
    });

    const httpCode = picture.status;
    const headers = picture.headers;
    const arrayBuffer = await picture.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    let filename = null;

    // Extract filename from Content-Disposition header
    const contentDisposition = headers.get("content-disposition");
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    user.image = body.toString("base64"); user.filename = filename; let finalmsg;

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
        finalmsg = { status: "success", code: 1, message: "O-Authorized successfully.", details: "O-Authorized", EmailId: user.email, SignUpId: signupid, Oauth: authCode, Token: request, Info: user, picture: user.image, filename: user.filename };
        user.oauthotpid = await signup.insert_oauth(finalmsg);
    } else {
        finalmsg = { status: "success", code: 1, message: "E-Authorized successfully.", token: request, addresname: user.email, details: "E-Authorized", serproid: serproid, usr_login: usr_login };
        user.addresid = await signup.insert_token(finalmsg);
    }
    return user;
}

async function googl_refresh(arr_temp, usr_login) {
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
    const cliscope = clientObj?.mail_scopes || '';
    const redirect = clientObj?.redirect_uris || [];
    const oauthuri = clientObj?.auth_uri || '';
    const tokenuri = clientObj?.token_uri || '';

    const refrestn = accessObj?.refresh_token || '';

    const postFields = {
        client_id: clientId,
        client_secret: clientSt,
        refresh_token: refrestn,
        grant_type: 'refresh_token'
    };

    const data = await signup.node_fetch(tokenuri, "POST", { "Content-Type": "application/x-www-form-urlencoded" }, new URLSearchParams(postFields));

    const queryParams = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirect,
        access_type: "offline",
        state: "",
        scope: cliscope,
        prompt: "select_account consent"
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

    return logmsg;
}

export default {
  googl_token,
  googl_refresh
};