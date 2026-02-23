const { isAdminTelegramId } = require('./auth');
const { route } = require('./router');
const { getConnectedNodes } = require('./websocket');

let sock = null;

async function setup() {
  if (!process.env.WHATSAPP_ADMIN_PHONE) {
    console.log('[whatsapp] No WHATSAPP_ADMIN_PHONE set — skipping WhatsApp setup');
    return null;
  }

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[whatsapp] Scan QR code above or visit /qr/whatsapp');
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('[whatsapp] Connection closed, reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          setTimeout(() => setup(), 3000);
        }
      } else if (connection === 'open') {
        console.log('[whatsapp] Connected');
      }
    });

    const adminPhone = process.env.WHATSAPP_ADMIN_PHONE;
    const adminJid = adminPhone.includes('@') ? adminPhone : `${adminPhone}@s.whatsapp.net`;

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation
          || msg.message.extendedTextMessage?.text
          || '';

        if (!text) continue;

        // Only accept messages from admin
        if (!sender.startsWith(adminPhone)) continue;

        // Handle commands
        if (text === '/nodes') {
          const nodes = getConnectedNodes();
          const reply = nodes.length === 0
            ? 'No remote nodes connected.'
            : nodes.map(n => `• ${n.name}`).join('\n');
          await sock.sendMessage(sender, { text: reply });
          continue;
        }

        if (text === '/status') {
          const nodes = getConnectedNodes();
          const uptime = Math.floor(process.uptime());
          await sock.sendMessage(sender, {
            text: `JerikoBot Status\nUptime: ${uptime}s\nNodes: ${nodes.length}`,
          });
          continue;
        }

        // Route to claude
        await sock.sendMessage(sender, { text: 'Processing...' });

        try {
          const result = await route(text);
          const response = result?.slice(0, 4000) || '(empty response)';
          await sock.sendMessage(sender, { text: response });
        } catch (err) {
          await sock.sendMessage(sender, { text: `Error: ${err.message}` });
        }
      }
    });

    return sock;
  } catch (err) {
    console.error('[whatsapp] Setup failed:', err.message);
    return null;
  }
}

function getSocket() {
  return sock;
}

module.exports = { setup, getSocket };
