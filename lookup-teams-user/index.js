const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function getAccessToken(tenantId, clientId, clientSecret) {
  const response = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default'
  }));

  return response.data.access_token;
}

async function lookupUser(accessToken, githubUsername, searchDomain, fallbackQuery = true) {
  let user;

  // Try direct lookup via userPrincipalName (if email-like)
  if (searchDomain) {
    const userPrincipalName = `${githubUsername}@${searchDomain}`;
    try {
      const res = await axios.get(`https://graph.microsoft.com/v1.0/users/${userPrincipalName}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      user = res.data;
      return user;
    } catch (err) {
      if (!fallbackQuery) throw new Error(`No user found with UPN: ${userPrincipalName}`);
    }
  }

  // Fallback: Search for matching displayName or mailNickname
  const res = await axios.get(`https://graph.microsoft.com/v1.0/users?$filter=startswith(displayName,'${githubUsername}') or startswith(mailNickname,'${githubUsername}')`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (res.data.value.length === 0) {
    throw new Error(`User '${githubUsername}' not found in Teams/Graph.`);
  }

  return res.data.value[0];
}

async function run() {
  try {
    const tenantId = core.getInput('tenant_id');
    const clientId = core.getInput('client_id');
    const clientSecret = core.getInput('client_secret');
    const githubUsername = core.getInput('github_username') || github.context.actor;
    const searchDomain = core.getInput('user_domain') || '';

    const token = await getAccessToken(tenantId, clientId, clientSecret);
    const user = await lookupUser(token, githubUsername, searchDomain);

    core.setOutput('userId', user.id);
    core.setOutput('displayName', user.displayName);
    core.setOutput('userPrincipalName', user.userPrincipalName);

    console.log(`✅ Found Teams user: ${user.displayName} (${user.userPrincipalName})`);
  } catch (error) {
    core.setFailed(`❌ ${error.message}`);
  }
}

run();
