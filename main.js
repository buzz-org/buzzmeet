// const { OAuth2Client } = require('google-auth-library');
// const client = new OAuth2Client("YOUR_GOOGLE_CLIENT_ID");

// app.post('/auth/google', async (req, res) => {
//     const { token } = req.body;
//     const ticket = await client.verifyIdToken({
//         idToken: token,
//         audience: "YOUR_GOOGLE_CLIENT_ID",
//     });
//     const payload = ticket.getPayload();
//     // payload contains email, name, picture
//     console.log(payload);
//     // Save user in DB (sign up) or login if exists
//     res.json({ user: payload });
// });

async function handleSendMessage(response, ws) {
  const jsonData = response.phpOutput;
  let sentCount = 0;
  
  if (jsonData && jsonData.terminate_session && jsonData.terminate_session.terminate_session) {
    const terminate_session = jsonData.terminate_session.terminate_session;
    // const sessionIds = terminate_session.map(row => row.SessnId);
    const terminateArray = Array.isArray(terminate_session)
  ? terminate_session
  : terminate_session
  ? Object.values(terminate_session)
  : [];
  const sessionIds = terminateArray.map(row => row.SessnId);
    console.log(`Found ${sessionIds.length} terminate_session:`, sessionIds);
    for (const session of terminateArray) {
      const targetWs = sessionWsMap.get(session.SessnId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        const tailoredResponse = {
          phpOutput: {
            terminate_session: {
              terminate_session: [session], // Send only the matching session row
            },
          },
        };
        const activejson = JSON.stringify(tailoredResponse);
        targetWs.send(activejson);
        sentCount++;
        console.log(`Sent message to session ${session.SessnId} for receiver ${session.User}`);
      } else {
        console.log(`No active WebSocket for session ${session.SessnId} for receiver ${session.User}`);
      }
    }
  } else {
    console.log('terminate_session not found or invalid');
  }

  if (jsonData && jsonData.get_receiver_sessions && jsonData.get_receiver_sessions.receiver_sessions) {
    const receiver_sessions = jsonData.get_receiver_sessions.receiver_sessions;
    // const sessionIds = receiver_sessions.map(row => row.SessnId);
    const receiverArray = Array.isArray(receiver_sessions)
  ? receiver_sessions
  : receiver_sessions
  ? Object.values(receiver_sessions)
  : [];
  const sessionIds = receiverArray.map(row => row.SessnId);
    console.log(`Found ${sessionIds.length} receiver_sessions:`, sessionIds);
    for (const session of receiverArray) {
      const targetWs = sessionWsMap.get(session.SessnId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        const tailoredResponse = {
          // ...response,
          phpOutput: {
            // ...jsonData,
            get_receiver_sessions: {
              ...jsonData.get_receiver_sessions,
              receiver_sessions: [session], // Send only the matching session row
            },
          },
        };
        const activejson = JSON.stringify(tailoredResponse);
        targetWs.send(activejson);
        sentCount++;
        console.log(`Sent message to session ${session.SessnId} for receiver ${session.User}`);
      } else {
        console.log(`No active WebSocket for session ${session.SessnId} for receiver ${session.User}`);
      }
    }
  } else if (jsonData && jsonData.get_active_sessions && jsonData.get_online_users && jsonData.get_active_sessions.active_sessions && jsonData.get_online_users.online_users) {
    const active_sessions = jsonData.get_active_sessions.active_sessions;
    const online_users = jsonData.get_online_users.online_users;
    const my_sessions = jsonData.get_my_sessions.my_sessions;
    // const sessionIds = active_sessions.map(row => row.SessnId);
    const sessionArray = Array.isArray(active_sessions)
    ? active_sessions
    : active_sessions
    ? Object.values(active_sessions) // convert object to array if needed
    : [];
    const sessionIds = sessionArray.map(row => row.SessnId);
    console.log(`Found ${sessionIds.length} active_sessions:`, sessionIds);
    for (const session of sessionArray) {
      const targetWs = sessionWsMap.get(session.SessnId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        // const matched_online_users = online_users.filter(user => user.login === session.User);
        const matched_online_users = Array.isArray(online_users)
  ? online_users.filter(u => u.login === session.User)
  : Object.values(online_users).filter(u => u.login === session.User);

        // const matched_my_sessions = my_sessions.filter(user => user.User === session.User);
        const matched_my_sessions = Array.isArray(my_sessions)
  ? my_sessions.filter(user => user.User === session.User)
  : Object.values(my_sessions).filter(user => user.User === session.User);

        const tailoredResponse = {
          ...response,
          phpOutput: {
            // ...jsonData,
            get_active_sessions: {
              active_sessions: [session], // Send only the matching session row
              online_users: matched_online_users,
              my_sessions: matched_my_sessions
            },
          },
        };
        const activejson = JSON.stringify(tailoredResponse);
        targetWs.send(activejson);
        sentCount++;
        console.log(`Sent message to session ${session.SessnId} for receiver ${session.User}`);
      } else {
        console.log(`No active WebSocket for session ${session.SessnId} for receiver ${session.User}`);
      }
    }
  } else {
    console.log('receiver_sessions/active_sessions not found or invalid');
  }
  
  if (jsonData && jsonData.get_sender_messages && jsonData.get_sender_sessions && jsonData.get_sender_messages.sender_messages && jsonData.get_sender_sessions.sender_sessions) {
    const active_sessions = jsonData.get_sender_sessions.sender_sessions;
    const online_users = jsonData.get_sender_messages.sender_messages
    // const sessionIds = active_sessions.map(row => row.SessnId);
    const sessionArray = Array.isArray(active_sessions)
    ? active_sessions
    : active_sessions
    ? Object.values(active_sessions) // convert object to array if needed
    : [];
    const sessionIds = sessionArray.map(row => row.SessnId);

    console.log(`Found ${sessionIds.length} sender_sessions:`, sessionIds);
    for (const session of sessionArray) {
      const targetWs = sessionWsMap.get(session.SessnId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        // const matched_online_users = online_users.filter(user => user.User === session.User);
        const matched_online_users = Array.isArray(online_users)
  ? online_users.filter(u => u.User === session.User)
  : Object.values(online_users).filter(u => u.User === session.User);
        const tailoredResponse = {
          ...response,
          phpOutput: {
            // ...jsonData,
            get_sender_sessions: {
              sender_sessions: [session], // Send only the matching session row
              sender_messages: matched_online_users,
            },
          },
        };
        const activejson = JSON.stringify(tailoredResponse);
        targetWs.send(activejson);
        sentCount++;
        console.log(`To sender_messages for sender_sessions ${session.SessnId} for sender_user ${session.User}`);
      } else {
        console.log(`No sender_messages for sender_sessions ${session.SessnId} for sender_user ${session.User}`);
      }
    }
  } else if (jsonData && jsonData.get_deliver_messages && jsonData.get_deliver_sessions && jsonData.get_deliver_messages.deliver_messages && jsonData.get_deliver_sessions.deliver_sessions) {
    const active_sessions = jsonData.get_deliver_sessions.deliver_sessions;
    const online_users = jsonData.get_deliver_messages.deliver_messages
    // const sessionIds = active_sessions.map(row => row.SessnId);
    const sessionArray = Array.isArray(active_sessions)
    ? active_sessions
    : active_sessions
    ? Object.values(active_sessions) // convert object to array if needed
    : [];
    const sessionIds = sessionArray.map(row => row.SessnId);
    console.log(`Found ${sessionIds.length} deliver_sessions:`, sessionIds);
    for (const session of sessionArray) {
      const targetWs = sessionWsMap.get(session.SessnId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        // const matched_online_users = online_users.filter(user => user.User === session.User);
        const matched_online_users = Array.isArray(online_users)
  ? online_users.filter(u => u.User === session.User)
  : Object.values(online_users).filter(u => u.User === session.User);
        const tailoredResponse = {
          ...response,
          phpOutput: {
            // ...jsonData,
            get_sender_sessions: {
              sender_sessions: [session], // Send only the matching session row
              sender_messages: matched_online_users,
            },
          },
        };
        const activejson = JSON.stringify(tailoredResponse);
        targetWs.send(activejson);
        sentCount++;
        console.log(`To deliver_messages for deliver_sessions ${session.SessnId} for deliver_user ${session.User}`);
      } else {
        console.log(`No deliver_messages for deliver_sessions ${session.SessnId} for deliver_user ${session.User}`);
      }
    }
  } else {
    console.log('sender_sessions/deliver_sessions not found or invalid');
  }
  response.message = `Message sent to ${sentCount} active sessions`;
  return response;
}

// Export the handleSendMessage function
export { handleSendMessage };