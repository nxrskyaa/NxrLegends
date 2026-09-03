// A stand-in Telegram Bot API. Lets the bot be driven end to end offline:
// you push fake user messages in, and read back whatever the bot sent.

import http from 'node:http';

export function startMockTelegram(port = 0) {
  const state = { sent: [], pending: [], nextUpdateId: 1, commandsSet: null };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = req.url.split('/').pop();
      const params = body ? JSON.parse(body) : {};
      let result;

      switch (method) {
        case 'getMe':
          result = { id: 42, is_bot: true, username: 'hermes_test_bot', first_name: 'Hermes' };
          break;
        case 'setMyCommands':
          state.commandsSet = params.commands;
          result = true;
          break;
        case 'getUpdates': {
          // offset -1 is the "drain the backlog" probe the bot makes on start.
          if (params.offset === -1) { result = []; break; }
          const take = state.pending.splice(0, state.pending.length);
          result = take;
          break;
        }
        case 'sendMessage':
          state.sent.push(params);
          result = { message_id: state.sent.length, text: params.text };
          break;
        default:
          result = true;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}`,
        state,
        /** Queue a message as if a user had typed it. */
        say(text, chatId = '999') {
          state.pending.push({
            update_id: state.nextUpdateId++,
            message: { message_id: state.nextUpdateId, chat: { id: Number(chatId) }, text },
          });
        },
        /** Wait until the bot has sent at least `n` messages. */
        async waitForSent(n, timeoutMs = 4000) {
          const t0 = Date.now();
          while (state.sent.length < n) {
            if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${n} messages (got ${state.sent.length})`);
            await new Promise((r) => setTimeout(r, 25));
          }
          return state.sent;
        },
        lastText: () => state.sent[state.sent.length - 1]?.text ?? '',
      })
    );
  });
}
