# Secure Chat

One shared chat room. Only people who know the fixed username and password can enter.
Every user sees the same conversation. Messages older than 10 days are deleted automatically.

## Run
    npm install
    CHAT_USERNAME=myteam CHAT_PASSWORD='a-strong-password' npm start
Open http://localhost:3000 (Windows PowerShell: `$env:CHAT_USERNAME="myteam"; $env:CHAT_PASSWORD="..."; npm start`).

Default login if you set nothing: team / change-me-now. Change it before sharing.

## Notes
- Login is checked on the server. The WebSocket refuses connections without a valid session token.
- Messages are stored in messages.json; the server purges anything older than 10 days at start, hourly, and whenever someone connects.
- 5 wrong passwords from one IP blocks further tries for 10 minutes.
- Use HTTPS in production (put it behind Nginx/Caddy or a host like Render/Railway) so the password isn't sent in plain text.