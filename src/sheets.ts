const { google } = require('googleapis');
const auth = require('./auth');
const inquirer = require('inquirer');


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