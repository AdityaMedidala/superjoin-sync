const BACKEND_URL = 'https://web-production-645c3.up.railway.app/webhook';  // ← Update this!

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Install new trigger
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  
  SpreadsheetApp.getUi().alert('✅ Setup complete!');
}

function onEditTrigger(e) {
  // Quick exit if not a valid
  if (!e || !e.range) return;
  
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();
  
  // Ignore multi-cell pastes
  if (row === 1 || range.getNumRows() > 1) return;
  
  // 🔒 Multiplayer Safety: Prevent race conditions
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(2000);  // Wait up to 2s if someone else is editing
  } catch (err) {
    Logger.log('Busy - skipping');
    return;
  }
  
  try {
    // Get data
    const id = sheet.getRange(row, 1).getValue();
    const header = sheet.getRange(1, col).getValue();
    const value = e.value || '';
    
    // Skip invalid
    if (!id || id === 'id') return;
    
    // webhook
    const payload = {
      id: String(id),
      header: String(header),
      value: String(value)
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true  // Don't show errors to user
    };
    
    UrlFetchApp.fetch(`${BACKEND_URL}/webhook`, options);
    
  } catch (err) {
    Logger.log('Error: ' + err);
  } finally {
    lock.releaseLock();  // Always release lock
  }
}

// Test function
function test() {
  const res = UrlFetchApp.fetch(`${BACKEND_URL}/`);
  Logger.log(res.getContentText());
  SpreadsheetApp.getUi().alert('Backend is reachable!');
}