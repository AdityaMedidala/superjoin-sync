const BACKEND_URL = 'https://web-production-645c3.up.railway.app'; 

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  
  SpreadsheetApp.getUi().alert('✅ Setup complete!');
}

function onEditTrigger(e) {
  if (!e || !e.range) return;
  
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();
  
  // Ignore header edits and bulk pastes
  if (row === 1 || range.getNumRows() > 1) return;
  
  // 🔒 Multiplayer Safety: Google Script Locking
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(2000); 
  } catch (err) {
    return; // System busy, skip to avoid lag
  }
  
  try {
    const id = sheet.getRange(row, 1).getValue();
    const header = sheet.getRange(1, col).getValue(); // Get column title
    const value = e.value || '';
    
    if (!id || id === 'id') return;
    
    const payload = {
      id: String(id),
      header: String(header), // e.g. "Email"
      value: String(value)
    };
    
    UrlFetchApp.fetch(`${BACKEND_URL}/webhook`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
  } catch (err) {
    Logger.log('Sync Error: ' + err);
  } finally {
    lock.releaseLock(); 
  }
}