const _crypto = require('node:crypto');
const http = require('http');
const url = require('url');
const fs = require('fs').promises;

const axios = require('axios');
const { google } = require('googleapis');
const inquirer = require('inquirer');
const opn = require('better-opn');
const yaml = require('js-yaml');

const redirectUri = 'http://localhost:3000/auth/callback';
const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];

const generateCodeVerifier = (): string => {
  const verifier = _crypto.randomBytes(32).toString('hex');
  return verifier;
};

const generateCodeChallenge = (verifier: string): string => {
  const challenge: string = _crypto.createHash('sha256').update(verifier).digest('base64');
  return challenge.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const pkceFlow = async (googleConfig): Promise<{ codeVerifier: string, authorizationCode: string }> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
    `response_type=code&` +
    `client_id=${googleConfig.client_id}&` +
    `redirect_uri=${redirectUri}&` +
    `scope=${scopes.join(' ')}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;

  console.log('Please visit the following URL to authenticate:');
  console.log(authUrl);

  let authorizationCode: string | null = null;
  // Start a simple HTTP server to listen for the authorization code
  const server = http.createServer(async (req: any, res: any) => {
    const { query } = url.parse(req.url!, true);
    const { code } = query;

    if (code) {
      authorizationCode = code;
      // Close the server after receiving the authorization code
      res.end('Authorization successful! You can close this browser tab now.');
    } else {
      // Display a message indicating that the code is missing
      res.end('Authorization code is missing. Please try again.');
    }
    server.close();
  });

  // Listen on the specified redirectUri port
  server.listen(3000, () => {
    console.log('Server listening on port 3000');
  });

  // Open the URL in the default browser
  await opn(authUrl);

  return new Promise((resolve, reject) => {
    server.on('close', () => {
      if (authorizationCode) {
        resolve({ codeVerifier, authorizationCode });
      } else {
        reject(new Error('could not fetch authorization code'));
      }
    });
  });
};

const exchangeCodeForToken = async (googleConfig, code: string, codeVerifier: string) => {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const params = {
    code,
    client_id: googleConfig.client_id,
    client_secret: googleConfig.client_secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  };

  const response = await axios.post(tokenUrl, null, {
    params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data;
};

export async function readYamlFile(filePath) {
    const fileData = await fs.readFile(filePath, 'utf-8');
    return yaml.load(fileData);
}

// Function to read JSON data from a file asynchronously
export async function readJsonFile(filePath, defaultData = {}) {
    try {
      const fileData = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(fileData);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
        // File doesn't exist, return the default data
        return defaultData;
      }
      // Handle other errors
      throw error;
    }
}
  
  // Function to write JSON data to a file asynchronously
export async function writeJsonFile(filePath, jsonData) {
    const jsonString = JSON.stringify(jsonData, null, 2); // 2 spaces for indentation
  
    await fs.writeFile(filePath, jsonString, 'utf-8');
}

export const googleAuthCredentials = async () => {
    const { google: googleConfig } = await readYamlFile('config.yaml');
    const data = await readJsonFile('data.json');
    if (!data.googleToken) {
        const { codeVerifier, authorizationCode } = await pkceFlow(googleConfig);
        const tokenResponse = await exchangeCodeForToken(googleConfig, authorizationCode, codeVerifier);
        data.googleToken = tokenResponse;
    }
    
    try {
        const auth = new google.auth.OAuth2({
            clientId: googleConfig.client_id,
            clientSecret: googleConfig.client_secret,
            redirectUri,
        });
        
        auth.setCredentials(data.googleToken);
        
        return auth;
    } finally {
        writeJsonFile('data.json', data);
    }
};

export async function selectCells(auth) {
    // Create a Sheets API client
    const sheets = google.sheets({ version: 'v4', auth });
        
    // Fetch a list of available spreadsheets
    const { data: { files } } = await google.drive({ version: 'v3', auth }).files.list();
    
    // Prompt the user to select a spreadsheet
    const spreadsheetPrompt = await inquirer.prompt([
        {
            type: 'list',
            name: 'spreadsheetId',
            message: 'Select a spreadsheet:',
            choices: files.map(file => ({ name: file.name, value: file.id })),
        },
    ]);
    
    const spreadsheetId = spreadsheetPrompt.spreadsheetId;
    
    // Fetch a list of sheets in the selected spreadsheet
    const sheetList = await getSheetList(sheets, spreadsheetId);
    
    // Prompt the user to select a sheet
    const sheetPrompt = await inquirer.prompt([
        {
            type: 'list',
            name: 'sheetTitle',
            message: 'Select a sheet:',
            choices: sheetList,
        },
    ]);
    
    const sheetTitle = sheetPrompt.sheetTitle;
    
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: [sheetTitle],
    });

    const table = response.data.sheets[0].data[0].rowData;
    const cells: Record<string, any>[] = [];
    const header = table[0].values;
    for (let rowIdx = 2; rowIdx < table.length; rowIdx++) {
        const row = table[rowIdx].values;
        if (!row) continue;
        const date = row[0];
        for (let colIdx=1; colIdx < row.length; colIdx++) {
            const cell = row[colIdx];
            if (cell.formattedValue) {
                cells.push({
                    column: header[colIdx].formattedValue,
                    date: date,
                    text: cell.formattedValue,
                    done: cell.effectiveFormat.textFormat.strikethrough,
                });
            }
        }
    }
    return cells;
}

async function showActiveCells() {
    const auth = await googleAuthCredentials();
    const cells = await selectCells(auth);
    console.log(cells.filter((c) => c.date.formattedValue && !c.done && c.date.formattedValue != 'lineup'));
}

// Function to fetch a list of sheets from a spreadsheet
async function getSheetList(sheets, spreadsheetId: string) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });

    return response.data.sheets.map(sheet => sheet.properties.title);
}

// Run the authentication and API request
//showActiveCells();