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
  
  // Ignore Header Edits
  if (row === 1) return;

  // [EDGE CASE] Concurrent/Bulk Edits
  // If user pastes multiple cells, we block it to prevent consistency issues
  // But we send a log to the dashboard to PROVE we blocked it.
  if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
    sendSystemLog("⚠️ Bulk/Paste edit ignored for safety");
    return;
  }
  
  // [EDGE CASE] Concurrent Edits
  // 🔒 LockService prevents multiple scripts from reading/writing simultaneously
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(2000); // Wait up to 2s for other edits to finish
  } catch (err) {
    return; // System busy, skip to avoid lag
  }
  
  try {
    const id = sheet.getRange(row, 1).getValue();
    const header = sheet.getRange(1, range.getColumn()).getValue();
    const value = e.value || '';
    
    if (!id || id === 'id') return;
    
    const payload = {
      id: String(id),
      header: String(header),
      value: String(value)
    };
    
    // [EDGE CASE] Network Failures
    // We wrap this in a helper that mutes exceptions so the user flow isn't interrupted
    sendWebhook(payload);
    
  } catch (err) {
    Logger.log('Sync Error: ' + err);
  } finally {
    lock.releaseLock(); 
  }
}

// Helper to send "System" alerts to Dashboard
function sendSystemLog(msg) {
  sendWebhook({
    id: "0",
    header: "SYSTEM",
    value: msg
  });
}

function sendWebhook(payload) {
  UrlFetchApp.fetch(`${BACKEND_URL}/webhook`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // [EDGE CASE] Handle Network Failures gracefully
  });
}