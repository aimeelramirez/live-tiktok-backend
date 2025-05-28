// server.js

require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { WebcastPushConnection } = require("tiktok-live-connector");

const app = express();

// Middleware
app.disable("x-powered-by");
app.use(cookieParser());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Env Vars
const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

const codeVerifierStore = {};

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Step 1: OAuth Start
app.get("/oauth", (req, res) => {
  const csrfState = crypto.randomBytes(16).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  codeVerifierStore[csrfState] = codeVerifier;

  res.cookie("csrfState", csrfState, {
    maxAge: 60000,
    httpOnly: true,
    secure: ENV === "production",
    sameSite: ENV === "production" ? "Strict" : "Lax",
  });

  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: "user.info.basic",
    response_type: "code",
    redirect_uri: TIKTOK_REDIRECT_URI,
    state: csrfState,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  return res.redirect(authUrl);
});

function validateTikTokCallback(req, res, next) {
  const { code, state, scopes, error, error_description } = req.query;
  const savedVerifier = codeVerifierStore[state];

  if (error) {
    return res.status(400).send(`<h1>Login Failed</h1><p>${error}: ${error_description || ""}</p>`);
  }

  if (!code || !state || !savedVerifier) {
    return res.status(400).send("<h1>Invalid Request</h1><p>Missing or invalid state/code.</p>");
  }

  req.tiktok = { code, state, scopes, codeVerifier: savedVerifier };
  next();
}

async function exchangeToken(req, res) {
  const { code, codeVerifier } = req.tiktok;

  try {
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: TIKTOK_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await response.json();

    if (tokenData.error) {
      return res.status(500).send(`<h1>Token Exchange Error</h1><p>${tokenData.error_description || tokenData.error}</p>`);
    }

    const userInfoRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userInfoRes.json();
    const user = userInfo.data.user || {};

    console.log("👤 Logged in as:", user.display_name);

    if (user.display_name) {
      const tiktokLive = new WebcastPushConnection(user.display_name);
      const likeMap = new Map();

      tiktokLive.connect().then((state) => {
        console.log(`🎥 Connected to LIVE room ${state.roomId} for @${user.display_name}`);

        tiktokLive.on("like", (data) => {
          const liker = data.uniqueId || "anonymous";
          const count = data.likeCount || 1;

          const current = likeMap.get(liker) || 0;
          likeMap.set(liker, current + count);

          console.clear();
          console.log(`💖 Likes received in ${user.display_name}'s stream:`);
          const sorted = [...likeMap.entries()].sort(([, a], [, b]) => b - a);
          for (const [name, total] of sorted) {
            console.log(`  • ${name}: ${total} like${total > 1 ? "s" : ""}`);
          }
        });

      }).catch((err) => {
        console.error("❌ LIVE Connect Error:", err.message || err);
      });
    }

    return res.send(`
      <h1>✅ TikTok Login Successful!</h1>
      <p><strong>Welcome, ${user.display_name || "User"}!</strong></p>
      ${user.avatar_url ? `<img src="${user.avatar_url}" alt="Avatar" style="height:100px;border-radius:50%;" />` : ""}
      <ul>
        <li><strong>Open ID:</strong> ${user.open_id || "N/A"}</li>
        <li><strong>Union ID:</strong> ${user.union_id || "N/A"}</li>
        <li><strong>Bio:</strong> ${user.bio_description || "N/A"}</li>
        <li><strong>Verified:</strong> ${user.is_verified ? "Yes" : "No"}</li>
        <li><strong>Profile Link:</strong> ${user.profile_deep_link ? `<a href="${user.profile_deep_link}" target="_blank">View Profile</a>` : "N/A"}</li>
      </ul>
      <pre>${JSON.stringify(userInfo, null, 2)}</pre>
    `);

  } catch (err) {
    console.error("❌ Token exchange failed:", err);
    return res.status(500).send("<h1>Server Error</h1><p>Failed to exchange token.</p>");
  }
}

app.get("/auth/callback", validateTikTokCallback, exchangeToken);

app.listen(PORT, () => {
  console.log(`🚀 TikTok OAuth server running at http://localhost:${PORT}`);
});
