const QRCode = require('qrcode');

function setup(app) {
  // QR code for Telegram bot
  app.get('/qr/telegram', async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(404).send('Telegram not configured');
    }

    // Extract bot username from token (make API call)
    try {
      const { Telegraf } = require('telegraf');
      const bot = new Telegraf(token);
      const me = await bot.telegram.getMe();
      const url = `https://t.me/${me.username}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 400 });

      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>JerikoBot — Telegram</title>
        <style>body{font-family:system-ui;text-align:center;padding:2rem;background:#1a1a2e;color:#fff}
        img{border-radius:12px}a{color:#0088cc}</style></head>
        <body>
          <h1>JerikoBot</h1>
          <p>Scan to open Telegram bot</p>
          <img src="${qrDataUrl}" />
          <p><a href="${url}">${url}</a></p>
        </body></html>
      `);
    } catch (err) {
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // QR code for WhatsApp (links to WhatsApp API)
  app.get('/qr/whatsapp', async (req, res) => {
    const phone = process.env.WHATSAPP_ADMIN_PHONE;
    if (!phone) {
      return res.status(404).send('WhatsApp not configured');
    }

    const url = `https://wa.me/${phone}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 400 });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>JerikoBot — WhatsApp</title>
      <style>body{font-family:system-ui;text-align:center;padding:2rem;background:#1a1a2e;color:#fff}
      img{border-radius:12px}a{color:#25d366}</style></head>
      <body>
        <h1>JerikoBot</h1>
        <p>Scan to open WhatsApp chat</p>
        <img src="${qrDataUrl}" />
        <p><a href="${url}">${url}</a></p>
      </body></html>
    `);
  });
}

module.exports = { setup };
